import type { FastifyInstance } from "fastify";
import { missingConfig } from "../infra/taiga";

/** Sondas do OpenShift (não levam a chave interna). */
export async function healthRoutes(app: FastifyInstance) {
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_req, reply) => {
    const missing = missingConfig();
    return missing.length ? reply.code(503).send({ status: "config", missing }) : { status: "ok" };
  });
}
