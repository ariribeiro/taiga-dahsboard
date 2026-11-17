import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { TaigaError } from "./infra/taiga";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { projectRoutes } from "./routes/projects";
import { sprintRoutes } from "./routes/sprint";
import { kanbanRoutes } from "./routes/kanban";
import { itemRoutes } from "./routes/items";

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

  // ---- Rotas ----
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(projectRoutes);
  app.register(sprintRoutes);
  app.register(kanbanRoutes);
  app.register(itemRoutes);

  return app;
}
