import { Semaphore } from "./limit";
import { isExampleUrl } from "./placeholder";

// Valor de exemplo do .env.example (…suaempresa.com) conta como "não configurada".
const rawUrl = (process.env.TAIGA_URL ?? "").replace(/\/+$/, "");
export const TAIGA_URL = isExampleUrl(rawUrl) ? "" : rawUrl;
const API = `${TAIGA_URL}/api/v1`;

// Usuário de serviço: é ele (e só ele) que consulta o Taiga. As pessoas só provam quem são no login (taigaLogin)
// e o token delas é descartado em seguida; o que cada uma pode ver é decidido por nós (papel no projeto).
const SERVICE_USER = process.env.TAIGA_SERVICE_USER ?? "";
const SERVICE_PASSWORD = process.env.TAIGA_SERVICE_PASSWORD ?? "";
/** Faltou alguma variável obrigatória? (lista os nomes; vazio = tudo configurado) */
export const missingConfig = (): string[] => [
  ...(TAIGA_URL ? [] : ["TAIGA_URL"]),
  ...(SERVICE_USER ? [] : ["TAIGA_SERVICE_USER"]),
  ...(SERVICE_PASSWORD ? [] : ["TAIGA_SERVICE_PASSWORD"]),
];

const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);
const TIMEOUT_MS = num(process.env.TAIGA_TIMEOUT_MS, 20_000);       // tempo máximo por requisição
const RETRIES = 2;                                                    // retentativas em falhas temporárias (só GET)
const gl = globalThis as unknown as { __taigaSem?: Semaphore };
const sem = (gl.__taigaSem ??= new Semaphore(num(process.env.TAIGA_MAX_CONCURRENCY, 8))); // requisições simultâneas ao Taiga
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isTimeout = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

export class TaigaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** POST em /auth ou /auth/refresh, traduzindo falhas de rede/certificado em TaigaError. */
async function authPost(path: string, body: unknown): Promise<Response> {
  if (!TAIGA_URL) throw new TaigaError(0, "CONFIG");
  try {
    return await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    console.error("[taiga] falha de rede para", `${API}${path}`, "->", cause?.code ?? cause?.message ?? e);
    const code = cause?.code ?? "";
    if (/CERT|SSL|TLS|ISSUER/.test(code)) throw new TaigaError(0, "CERT");
    throw new TaigaError(0, "REDE");
  }
}

/** Confere usuário e senha de uma PESSOA no Taiga. Só devolve o perfil: o token dela não é guardado nem usado. */
export async function taigaLogin(username: string, password: string) {
  const res = await authPost("/auth", { type: "normal", username, password });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[login] Taiga respondeu", res.status, body.slice(0, 300));
    throw new TaigaError(res.status, res.status === 400 || res.status === 401 ? "CRED" : `HTTP${res.status}`);
  }
  const u = (await res.json()) as Record<string, unknown>;
  delete u.auth_token; delete u.refresh; // não deixa o token da pessoa chegar a lugar nenhum
  return u as { id: number; username: string; full_name?: string; full_name_display?: string; photo?: string | null };
}

// ---- Token do usuário de serviço: obtido sob demanda, renovado em 401 (refresh e, se falhar, novo login) ----
type Tokens = { auth: string; refresh: string | null };
let tokens: Tokens | null = null;
let renewing: Promise<Tokens> | null = null;

async function serviceLogin(): Promise<Tokens> {
  if (missingConfig().length) throw new TaigaError(0, "CONFIG");
  const res = await authPost("/auth", { type: "normal", username: SERVICE_USER, password: SERVICE_PASSWORD });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[taiga] login do usuário de serviço recusado:", res.status, body.slice(0, 200));
    throw new TaigaError(503, "SERVICE_AUTH");
  }
  const j = (await res.json()) as { auth_token?: string; refresh?: string };
  if (!j.auth_token) throw new TaigaError(503, "SERVICE_AUTH");
  return (tokens = { auth: j.auth_token, refresh: j.refresh ?? null });
}

async function currentTokens(): Promise<Tokens> {
  return tokens ?? (renewing ??= serviceLogin().finally(() => { renewing = null; }));
}

/** Renova o token que acabou de levar 401. Várias requisições simultâneas compartilham uma única renovação. */
function renewTokens(failed: Tokens): Promise<Tokens> {
  if (tokens && tokens !== failed) return Promise.resolve(tokens); // outra requisição já renovou
  return (renewing ??= (async () => {
    if (failed.refresh) {
      const r = await authPost("/auth/refresh", { refresh: failed.refresh }).catch(() => null);
      if (r?.ok) {
        const j = (await r.json().catch(() => ({}))) as { auth_token?: string; refresh?: string };
        if (j.auth_token) return (tokens = { auth: j.auth_token, refresh: j.refresh ?? failed.refresh });
      }
    }
    tokens = null;
    return serviceLogin();
  })().finally(() => { renewing = null; }));
}

/**
 * GET com limite de concorrência, timeout e retentativas (429/502/503/504 e falhas de rede) com espera crescente.
 * Timeout não é retentado: repetir só multiplicaria a espera do usuário.
 */
async function limitedGet(url: string, headers: Record<string, string>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const r = await sem.run(() =>
      fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }).then((res) => ({ res }), (err: unknown) => ({ err })),
    );
    if ("res" in r) {
      if (![429, 502, 503, 504].includes(r.res.status) || attempt >= RETRIES) return r.res;
      const ra = Number(r.res.headers.get("retry-after"));
      await r.res.body?.cancel().catch(() => {});
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 3000) : 300 * 3 ** attempt);
      continue;
    }
    if (isTimeout(r.err)) throw new TaigaError(504, "Taiga demorou demais para responder");
    if (attempt >= RETRIES) throw new TaigaError(502, "Falha de rede ao consultar o Taiga");
    await sleep(300 * 3 ** attempt);
  }
}

/** Lê o JSON; o timeout também vale enquanto o corpo é recebido. */
async function readJson<T>(res: Response): Promise<T> {
  try { return (await res.json()) as T; }
  catch (e) { throw isTimeout(e) ? new TaigaError(504, "Taiga demorou demais para responder") : e; }
}

/** Requisição autenticada com o usuário de serviço (renova o token uma vez em 401). `paginated`: não pede para desabilitar a paginação. */
async function taigaFetch(path: string, paginated: boolean): Promise<Response> {
  const doFetch = (t: Tokens) =>
    limitedGet(`${API}${path}`, { Authorization: `Bearer ${t.auth}`, ...(paginated ? {} : { "x-disable-pagination": "True" }) });

  const first = await currentTokens();
  let res = await doFetch(first);
  if (res.status === 401) {
    res = await doFetch(await renewTokens(first));
    // 401 mesmo com token novo: problema do usuário de serviço, nunca da pessoa logada
    if (res.status === 401) throw new TaigaError(503, "SERVICE_AUTH");
  }
  if (!res.ok) throw new TaigaError(res.status, `Taiga ${res.status} em ${path}`);
  return res;
}

/** GET autenticado, sem paginação (traz tudo). */
export async function taigaGet<T>(path: string): Promise<T> {
  return readJson<T>(await taigaFetch(path, false));
}

/**
 * GET paginado: devolve a página pedida (use ?page=N&page_size=M) e o TOTAL de itens,
 * lido do cabeçalho x-pagination-count — permite mostrar contagens sem baixar tudo.
 */
export async function taigaGetPaged<T extends unknown[]>(path: string): Promise<{ data: T; count: number }> {
  const res = await taigaFetch(path, true);
  const data = await readJson<T>(res);
  const h = Number(res.headers.get("x-pagination-count"));
  return { data, count: Number.isFinite(h) && res.headers.has("x-pagination-count") ? h : data.length };
}

// ---- Tipos (apenas os campos usados) ----
export type TProject = { id: number; name: string; slug: string; description?: string; logo_small_url?: string | null; logo_big_url?: string | null; is_backlog_activated?: boolean; is_kanban_activated?: boolean };
export type TMember = { user: number | null; full_name: string; photo: string | null; role_name: string; is_active?: boolean; is_user_active?: boolean };
export type TMilestone = {
  id: number; name: string; slug: string;
  estimated_start: string; estimated_finish: string;
  closed: boolean; total_points: number | null; closed_points: number | null;
};
export type TStatusInfo = { name: string; color: string };
export type TUserInfo = { id: number; username?: string; full_name_display?: string; full_name?: string; photo?: string | null };
export type TStory = {
  id: number; ref: number; subject: string;
  assigned_to: number | null; assigned_users: number[];
  assigned_to_extra_info?: TUserInfo | null;
  status_extra_info: TStatusInfo; is_closed: boolean; total_points: number | null;
  is_blocked?: boolean; blocked_note?: string;
  status?: number; created_date?: string; modified_date?: string; finish_date?: string | null;
};
export type TTask = {
  id: number; ref: number; subject: string; user_story: number | null;
  assigned_to: number | null; assigned_to_extra_info?: TUserInfo | null;
  status_extra_info: TStatusInfo; is_closed: boolean;
  is_blocked?: boolean; blocked_note?: string;
};

// Só quem tem este papel NO PROJETO pode ver o projeto. O nome varia entre projetos, então basta o papel
// conter "servidor", "fiscal" ou "fiscalização" (ignorando maiúsculas e acentos; "fiscal" já cobre "fiscalização").
export const ALLOWED_ROLE = "Servidor Dirti/Fiscal";
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function isAllowedRole(role?: string | null): boolean {
  const t = plain(role ?? "");
  return ["servidor", "fiscal", "fiscalizacao"].some((w) => t.includes(w));
}

export async function getProjects(userId: number): Promise<TProject[]> {
  const [projects, memberships] = await Promise.all([
    taigaGet<TProject[]>(`/projects?member=${userId}&order_by=memberships__user_order`),
    taigaGet<{ project: number; user: number | null; role_name: string }[]>(`/memberships?member=${userId}`),
  ]);
  // confere também o usuário: não depende de o Taiga aplicar o filtro ?member=
  const ok = new Set(memberships.filter((m) => m.user === userId && isAllowedRole(m.role_name)).map((m) => m.project));
  return projects.filter((p) => ok.has(p.id));
}

/** O usuário é Servidor Dirti/Fiscal neste projeto? Usado para bloquear o acesso ao projeto. */
export async function hasProjectAccess(userId: number, projectId: number): Promise<boolean> {
  try {
    // pede só o vínculo do usuário; o filtro local garante o resultado mesmo se o Taiga ignorar ?member=
    const mine = await taigaGet<TMember[]>(`/memberships?project=${projectId}&member=${userId}`);
    return mine.some((m) => m.user === userId && isAllowedRole(m.role_name));
  } catch (e) {
    if (e instanceof TaigaError && (e.status === 403 || e.status === 404)) return false;
    throw e;
  }
}
const projCache = ((globalThis as unknown as { __projCache?: Map<number, { at: number; data: TProject[] }> }).__projCache ??= new Map());
/** Lista de projetos com cache de 5 min — usada no seletor do cabeçalho, que aparece em toda página. */
export async function getProjectsCached(userId: number): Promise<TProject[]> {
  const hit = projCache.get(userId);
  if (hit && Date.now() - hit.at < 300_000) return hit.data;
  const data = await getProjects(userId);
  projCache.set(userId, { at: Date.now(), data });
  return data;
}
export const getProject = (id: number) => taigaGet<TProject>(`/projects/${id}`);
export const getMembers = (p: number) => taigaGet<TMember[]>(`/memberships?project=${p}`);
export const getMilestones = (p: number) => taigaGet<TMilestone[]>(`/milestones?project=${p}`);
export const getStories = (p: number, m: number) => taigaGet<TStory[]>(`/userstories?project=${p}&milestone=${m}`);
export const getTasks = (p: number, m: number) => taigaGet<TTask[]>(`/tasks?project=${p}&milestone=${m}`);
export const getUser = (id: number) => taigaGet<TUserInfo>(`/users/${id}`);

export type TStatsDay = { day: string; name: number | string; open_points: number | null; optimal_points: number | null };
export type TMilestoneStats = { days?: TStatsDay[] };
export const getMilestoneStats = (id: number) => taigaGet<TMilestoneStats>(`/milestones/${id}/stats`);

export type TUsStatus = { id: number; name: string; color: string; order: number; is_closed: boolean; is_archived?: boolean; wip_limit?: number | null };
export const getUsStatuses = (p: number) => taigaGet<TUsStatus[]>(`/userstory-statuses?project=${p}`);
