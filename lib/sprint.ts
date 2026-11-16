import { getMembers, getMilestones, getProject, getStories, getTasks, getUser } from "./taiga";
import { buildViews, pickCurrentSprint } from "./metrics";

/** Carrega tudo o que as páginas de sprint/dev precisam. */
export async function loadSprint(pid: number, sprintParam?: string) {
  const [project, members, milestones] = await Promise.all([getProject(pid), getMembers(pid), getMilestones(pid)]);
  const sorted = [...milestones].sort((a, b) => b.estimated_start.localeCompare(a.estimated_start));
  const sprint = milestones.find((m) => String(m.id) === sprintParam) ?? pickCurrentSprint(milestones);
  if (!sprint) return { project, sorted, sprint: null as null };
  const [stories, tasks] = await Promise.all([getStories(pid, sprint.id), getTasks(pid, sprint.id)]);

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

  const { devs, overview } = buildViews(members, stories, tasks, sprint, known);
  return { project, sorted, sprint, devs, overview, members };
}
