import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { createSession, destroySession, getSession, SESSION_MAX_AGE_S, type Session } from "./lib/session";
import { clientIp, loginLimiters } from "./lib/ratelimit";
import { getProject, getProjects, getProjectsCached, hasProjectAccess, missingConfig, taigaLogin, TaigaError } from "./lib/taiga";
import { loadSprint } from "./lib/sprint";
import { loadKanban } from "./lib/kanban";
import { kanbanMetrics } from "./lib/kanban-metrics";
import { paceOf } from "./lib/metrics";
import { parsePeriod } from "./lib/periods";
import { ItemNotFound, loadItem } from "./lib/item-detail";
import { meta, STALE_DAYS } from "./lib/meta";

type Q = Record<string, string | undefined>;

const bearer = (req: FastifyRequest): string | null => {
  const m = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization ?? "");
  return m ? m[1] : null;
};

const sameKey = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Constrói a API. `apiKey`: chave compartilhada com o front (opcional, mas recomendada em produção). */
export function buildApp(opts: { apiKey?: string; logger?: boolean } = {}) {
  const apiKey = opts.apiKey ?? process.env.INTERNAL_API_KEY ?? "";
  const app = Fastify({
    logger: opts.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.authorization", "req.headers['x-api-key']"] },
    bodyLimit: 16 * 1024, // só o login tem corpo
  });

  // ---- Segurança comum ----
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz" || req.url === "/readyz") return; // sondas do OpenShift não levam a chave
    if (apiKey) {
      const got = req.headers["x-api-key"];
      if (typeof got !== "string" || !sameKey(got, apiKey)) return reply.code(401).send({ error: "API_KEY" });
    }
  });
  app.addHook("onSend", async (_req, reply) => { reply.header("Cache-Control", "no-store"); });

  // Erros do Taiga viram respostas HTTP claras; o resto vira 500 sem detalhes.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof TaigaError) {
      if (err.message === "CONFIG") return reply.code(503).send({ error: "CONFIG" });
      if (err.message === "SERVICE_AUTH") return reply.code(503).send({ error: "SERVICE_AUTH" });
      if (err.status === 403) return reply.code(403).send({ error: "FORBIDDEN" });
      if (err.status === 404) return reply.code(404).send({ error: "NOT_FOUND" });
      if (err.status === 504) return reply.code(504).send({ error: "TIMEOUT" });
      req.log.error({ err: err.message, status: err.status }, "falha ao consultar o Taiga");
      return reply.code(502).send({ error: "UPSTREAM" });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: "BAD_REQUEST" });
    req.log.error(err);
    return reply.code(500).send({ error: "INTERNAL" });
  });

  // ---- Sondas ----
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_req, reply) => {
    const missing = missingConfig();
    return missing.length ? reply.code(503).send({ status: "config", missing }) : { status: "ok" };
  });

  // ---- Autenticação ----
  app.post("/auth/login", async (req, reply) => {
    const b = (req.body ?? {}) as { username?: unknown; password?: unknown };
    if (typeof b.username !== "string" || typeof b.password !== "string") return reply.code(400).send({ error: "BAD_REQUEST" });
    const username = b.username.trim(), password = b.password;
    if (!username || !password || username.length > 254 || password.length > 1024) return reply.code(400).send({ error: "BAD_REQUEST" });
    if (missingConfig().length) return reply.code(503).send({ error: "CONFIG" });

    // Freio de força bruta: bloqueia ANTES de consultar o Taiga (por usuário e por IP).
    const userKey = username.toLowerCase();
    const ip = clientIp(req.headers);
    const wait = Math.max(loginLimiters.user.retryAfter(userKey), loginLimiters.ip.retryAfter(ip));
    if (wait > 0) {
      req.log.warn({ ip, retryAfterS: Math.ceil(wait / 1000) }, "login bloqueado por excesso de tentativas");
      return reply.code(429).header("Retry-After", String(Math.ceil(wait / 1000))).send({ error: "LIMITE", retryAfterMinutes: Math.max(1, Math.ceil(wait / 60_000)) });
    }

    try {
      const u = await taigaLogin(username, password);
      loginLimiters.user.reset(userKey);
      const user: Session = { userId: u.id, fullName: u.full_name_display ?? u.full_name ?? u.username, username: u.username, photo: u.photo ?? null };
      const sid = createSession(user, bearer(req)); // um novo login encerra a sessão anterior deste navegador
      return { sid, maxAge: SESSION_MAX_AGE_S, user };
    } catch (e) {
      if (!(e instanceof TaigaError)) throw e;
      // só credenciais recusadas contam como tentativa; falha de rede não penaliza ninguém
      if (e.message === "CRED") { loginLimiters.user.fail(userKey); loginLimiters.ip.fail(ip); return reply.code(401).send({ error: "CRED" }); }
      if (e.message === "CONFIG") return reply.code(503).send({ error: "CONFIG" });
      if (e.message === "CERT" || e.message === "REDE") return reply.code(502).send({ error: e.message });
      return reply.code(502).send({ error: "UPSTREAM" });
    }
  });

  app.post("/auth/logout", async (req, reply) => { destroySession(bearer(req)); return reply.code(204).send(); });

  // Tudo abaixo exige sessão.
  const auth = (req: FastifyRequest, reply: FastifyReply): Session | null => {
    const s = getSession(bearer(req));
    if (!s) { reply.code(401).send({ error: "UNAUTHENTICATED" }); return null; }
    return s;
  };
  const projectId = (v: string | undefined) => (/^\d{1,9}$/.test(v ?? "") ? Number(v) : null);
  /** Valida o id e o papel da pessoa no projeto. Devolve o id, ou null depois de responder 400/403. */
  async function guard(req: FastifyRequest, reply: FastifyReply, s: Session, raw: string | undefined): Promise<number | null> {
    const pid = projectId(raw);
    if (pid == null) { reply.code(400).send({ error: "BAD_REQUEST" }); return null; }
    if (!(await hasProjectAccess(s.userId, pid))) { reply.code(403).send({ error: "FORBIDDEN" }); return null; }
    return pid;
  }

  app.get("/me", async (req, reply) => auth(req, reply) ?? undefined);

  app.get("/projects", async (req, reply) => {
    const s = auth(req, reply); if (!s) return;
    const q = req.query as Q;
    // ?cache=1: lista com cache de 5 min (seletor do cabeçalho, que aparece em toda página)
    return { projects: q.cache === "1" ? await getProjectsCached(s.userId) : await getProjects(s.userId) };
  });

  app.get("/projects/:id/sprint", async (req, reply) => {
    const s = auth(req, reply); if (!s) return;
    const pid = await guard(req, reply, s, (req.params as Q).id); if (pid == null) return;
    const q = req.query as Q;
    const d = await loadSprint(pid, q.sprint, q.stats === "1");
    if (d.kind === "kanban") return { kind: "kanban", project: d.project };
    if (!d.sprint) return { kind: "scrum", project: d.project, sorted: d.sorted, sprint: null, meta: meta() };
    return {
      kind: "scrum", project: d.project, sorted: d.sorted, sprint: d.sprint,
      devs: d.devs, overview: d.overview, unassigned: d.unassigned, stats: d.stats,
      pace: paceOf(d.overview.progress, d.overview.expectedProgress, d.sprint.closed),
      meta: meta(),
    };
  });

  app.get("/projects/:id/kanban", async (req, reply) => {
    const s = auth(req, reply); if (!s) return;
    const pid = await guard(req, reply, s, (req.params as Q).id); if (pid == null) return;
    const days = parsePeriod((req.query as Q).days);
    const [project, data] = await Promise.all([getProject(pid), loadKanban(pid)]);
    const metrics = kanbanMetrics({ statuses: data.statuses, open: data.open, done: data.done, doneTotal: data.doneTotal, ordered: data.ordered, partial: data.partial, members: data.members, days, staleDays: STALE_DAYS });
    return { project, days, board: data.statuses, doneTotal: data.doneTotal, fetched: data.done.length, ordered: data.ordered, partial: data.partial, metrics, meta: meta() };
  });

  app.get("/items", async (req, reply) => {
    const s = auth(req, reply); if (!s) return;
    const q = req.query as Q;
    const id = projectId(q.id);
    if ((q.kind !== "us" && q.kind !== "task") || id == null) return reply.code(400).send({ error: "BAD_REQUEST" });
    const pid = await guard(req, reply, s, q.project); if (pid == null) return;
    try {
      return await loadItem(q.kind, id, pid);
    } catch (e) {
      if (e instanceof ItemNotFound) return reply.code(404).send({ error: "NOT_FOUND" });
      throw e;
    }
  });

  return app;
}
