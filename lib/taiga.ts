import { getSession } from "./session";

export const TAIGA_URL = (process.env.TAIGA_URL ?? "").replace(/\/+$/, "");
const API = `${TAIGA_URL}/api/v1`;

export class TaigaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function taigaLogin(username: string, password: string) {
  if (!TAIGA_URL) throw new TaigaError(0, "CONFIG");
  let res: Response;
  try {
    res = await fetch(`${API}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "normal", username, password }),
      cache: "no-store",
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    console.error("[login] falha de rede para", `${API}/auth`, "->", cause?.code ?? cause?.message ?? e);
    const code = cause?.code ?? "";
    if (/CERT|SSL|TLS|ISSUER/.test(code)) throw new TaigaError(0, "CERT");
    throw new TaigaError(0, "REDE");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[login] Taiga respondeu", res.status, body.slice(0, 300));
    throw new TaigaError(res.status, res.status === 400 || res.status === 401 ? "CRED" : `HTTP${res.status}`);
  }
  return res.json();
}

/** GET autenticado. Em 401 tenta renovar o token uma vez. */
export async function taigaGet<T>(path: string): Promise<T> {
  const cur = getSession();
  if (!cur) throw new TaigaError(401, "Sem sessão");
  const { session } = cur;

  const doFetch = () =>
    fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${session.authToken}`,
        "x-disable-pagination": "True",
      },
      cache: "no-store",
    });

  let res = await doFetch();
  if (res.status === 401 && session.refresh) {
    const r = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: session.refresh }),
      cache: "no-store",
    });
    if (r.ok) {
      const j = await r.json();
      session.authToken = j.auth_token ?? session.authToken;
      session.refresh = j.refresh ?? session.refresh;
      res = await doFetch();
    }
  }
  if (!res.ok) throw new TaigaError(res.status, `Taiga ${res.status} em ${path}`);
  return res.json();
}

// ---- Tipos (apenas os campos usados) ----
export type TProject = { id: number; name: string; slug: string; description?: string; logo_small_url?: string | null };
export type TMember = { user: number | null; full_name: string; photo: string | null; role_name: string; is_active: boolean };
export type TMilestone = {
  id: number; name: string; slug: string;
  estimated_start: string; estimated_finish: string;
  closed: boolean; total_points: number | null; closed_points: number | null;
};
export type TStatusInfo = { name: string; color: string };
export type TStory = {
  id: number; ref: number; subject: string;
  assigned_to: number | null; assigned_users: number[];
  status_extra_info: TStatusInfo; is_closed: boolean; total_points: number | null;
};
export type TTask = {
  id: number; ref: number; subject: string; user_story: number | null;
  assigned_to: number | null; status_extra_info: TStatusInfo; is_closed: boolean;
};

export const getProjects = (userId: number) =>
  taigaGet<TProject[]>(`/projects?member=${userId}&order_by=memberships__user_order`);
export const getProject = (id: number) => taigaGet<TProject>(`/projects/${id}`);
export const getMembers = (p: number) => taigaGet<TMember[]>(`/memberships?project=${p}`);
export const getMilestones = (p: number) => taigaGet<TMilestone[]>(`/milestones?project=${p}`);
export const getStories = (p: number, m: number) => taigaGet<TStory[]>(`/userstories?project=${p}&milestone=${m}`);
export const getTasks = (p: number, m: number) => taigaGet<TTask[]>(`/tasks?project=${p}&milestone=${m}`);
