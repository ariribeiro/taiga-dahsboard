import type { FastifyInstance } from "fastify";
import { getProjects, getProjectsCached } from "../infra/taiga";
import { requireSession, type Q } from "./guards";

export async function projectRoutes(app: FastifyInstance) {
  app.get("/projects", async (req, reply) => {
    const s = requireSession(req, reply); if (!s) return;
    // ?cache=1: lista com cache de 5 min (seletor do cabeçalho, que aparece em toda página)
    const cached = (req.query as Q).cache === "1";
    return { projects: cached ? await getProjectsCached(s.userId) : await getProjects(s.userId) };
  });
}
