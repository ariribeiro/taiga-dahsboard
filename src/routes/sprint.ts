import type { FastifyInstance } from "fastify";
import { loadSprint } from "../services/sprint";
import { meta } from "../services/meta";
import { paceOf } from "../domain/metrics";
import { guardProject, requireSession, type Q } from "./guards";

export async function sprintRoutes(app: FastifyInstance) {
  app.get("/projects/:id/sprint", async (req, reply) => {
    const s = requireSession(req, reply); if (!s) return;
    const pid = await guardProject(reply, s, (req.params as Q).id); if (pid == null) return;
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
}
