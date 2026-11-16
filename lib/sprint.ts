import { getMembers, getMilestones, getProject, getStories, getTasks } from "./taiga";
import { buildViews, pickCurrentSprint } from "./metrics";

/** Carrega tudo o que as páginas de sprint/dev precisam. */
export async function loadSprint(pid: number, sprintParam?: string) {
  const [project, members, milestones] = await Promise.all([getProject(pid), getMembers(pid), getMilestones(pid)]);
  const sorted = [...milestones].sort((a, b) => b.estimated_start.localeCompare(a.estimated_start));
  const sprint = milestones.find((m) => String(m.id) === sprintParam) ?? pickCurrentSprint(milestones);
  if (!sprint) return { project, sorted, sprint: null as null };
  const [stories, tasks] = await Promise.all([getStories(pid, sprint.id), getTasks(pid, sprint.id)]);
  const { devs, overview } = buildViews(members, stories, tasks, sprint);
  return { project, sorted, sprint, devs, overview, members };
}
