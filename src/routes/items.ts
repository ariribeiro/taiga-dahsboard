import type { FastifyInstance } from "fastify";
import { ItemNotFound, loadItem } from "../services/item-detail";
import { guardProject, requireSession, toId, type Q } from "./guards";

export async function itemRoutes(app: FastifyInstance) {
  app.get("/items", async (req, reply) => {
    const s = requireSession(req, reply); if (!s) return;
    const q = req.query as Q;
    const id = toId(q.id);
    if ((q.kind !== "us" && q.kind !== "task") || id == null) return reply.code(400).send({ error: "BAD_REQUEST" });
    const pid = await guardProject(reply, s, q.project); if (pid == null) return;
    try {
      return await loadItem(q.kind, id, pid);
    } catch (e) {
      if (e instanceof ItemNotFound) return reply.code(404).send({ error: "NOT_FOUND" });
      throw e;
    }
  });
}
