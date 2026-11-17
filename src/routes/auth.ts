import type { FastifyInstance } from "fastify";
import { createSession, destroySession, SESSION_MAX_AGE_S, type Session } from "../infra/session";
import { clientIp, loginLimiters } from "../infra/ratelimit";
import { missingConfig, taigaLogin, TaigaError } from "../infra/taiga";
import { bearer, requireSession } from "./guards";

export async function authRoutes(app: FastifyInstance) {
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

  app.get("/me", async (req, reply) => requireSession(req, reply) ?? undefined);
}
