import { getMembers, getMilestones, getProject, getStories, getTasks, getUser, getMilestoneStats } from "./taiga";
import { buildViews, pickCurrentSprint } from "./metrics";

/** Carrega tudo o que as páginas de sprint/dev precisam. */
export async function loadSprint(pid: number, sprintParam?: string, withStats = false) {
  const project = await getProject(pid);
  // Projeto sem o módulo Scrum (backlog/sprints) desativado: usa a visão de fluxo (Kanban)
  if (project.is_backlog_activated === false) return { kind: "kanban" as const, project, sorted: [], sprint: null as null };
  const [members, milestones] = await Promise.all([getMembers(pid), getMilestones(pid)]);
  // Scrum ligado, mas nunca usado (nenhuma sprint) e Kanban ativo: também usa a visão de fluxo
  if (!milestones.length && project.is_kanban_activated) return { kind: "kanban" as const, project, sorted: [], sprint: null as null };
  const sorted = [...milestones].sort((a, b) => b.estimated_start.localeCompare(a.estimated_start));
  const sprint = milestones.find((m) => String(m.id) === sprintParam) ?? pickCurrentSprint(milestones);
  if (!sprint) return { kind: "scrum" as const, project, sorted, sprint: null as null };
  const [stories, tasks, stats] = await Promise.all([
    getStories(pid, sprint.id), getTasks(pid, sprint.id),
    // burndown: se o endpoint falhar, a página segue sem o gráfico
    withStats ? getMilestoneStats(sprint.id).catch(() => null) : Promise.resolve(null),
  ]);

  // Quem tem item atribuído mas não está (mais) na lista de membros: descobre o nome
  // pelo extra_info das próprias stories/tasks e, se faltar, por GET /users/{id}.
  const known = new Map<number, { name: string; photo: string | null }>();
  for (const x of [...stories, ...tasks]) {
    const u = x.assigned_to_extra_info;
    const n = u?.full_name_display || u?.full_name || u?.username;
    if (x.assigned_to && n) known.set(x.assigned_to, { name: n, photo: u?.photo ?? null });
  }
  const ids = new Set<number>();
  for (const s of stories) [...(s.assigned_users ?? []), s.assigned_to].forEach((i) => i && ids.add(i));
  for (const t of tasks) t.assigned_to && ids.add(t.assigned_to);
  const missing = [...ids].filter((i) => !known.has(i) && !members.some((m) => m.user === i));
  await Promise.all(missing.map(async (i) => {
    try { const u = await getUser(i); const n = u.full_name_display || u.full_name || u.username; if (n) known.set(i, { name: n, photo: u.photo ?? null }); } catch { /* sem permissão: mantém o fallback */ }
  }));

  const { devs, overview, unassigned } = buildViews(members, stories, tasks, sprint, known);
  return { kind: "scrum" as const, project, sorted, sprint, devs, overview, unassigned, members, stats };
}
