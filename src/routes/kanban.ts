import type { FastifyInstance } from "fastify";
import { getProject } from "../infra/taiga";
import { loadKanban } from "../services/kanban";
import { meta, STALE_DAYS } from "../services/meta";
import { kanbanMetrics } from "../domain/kanban-metrics";
import { parsePeriod } from "../domain/periods";
import { guardProject, requireSession, type Q } from "./guards";

export async function kanbanRoutes(app: FastifyInstance) {
  app.get("/projects/:id/kanban", async (req, reply) => {
    const s = requireSession(req, reply); if (!s) return;
    const pid = await guardProject(reply, s, (req.params as Q).id); if (pid == null) return;
    const days = parsePeriod((req.query as Q).days);
    const [project, data] = await Promise.all([getProject(pid), loadKanban(pid)]);
    const metrics = kanbanMetrics({ statuses: data.statuses, open: data.open, done: data.done, doneTotal: data.doneTotal, ordered: data.ordered, partial: data.partial, members: data.members, days, staleDays: STALE_DAYS });
    return { project, days, board: data.statuses, doneTotal: data.doneTotal, fetched: data.done.length, ordered: data.ordered, partial: data.partial, metrics, meta: meta() };
  });
}
