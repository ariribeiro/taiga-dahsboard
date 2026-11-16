import type { TMember, TMilestone, TStory, TTask } from "./taiga";

export type DevStory = { id: number; ref: number; subject: string; status: string; color: string; closed: boolean; points: number; role: "responsável" | "via task"; blocked: string | null };
export type DevTask = { id: number; ref: number; subject: string; status: string; color: string; closed: boolean; storyRef: number | null; blocked: string | null };
export type DevView = {
  userId: number | null; name: string; photo: string | null; role: string;
  stories: DevStory[]; tasks: DevTask[];
  points: number; closedPoints: number;
  tasksDone: number; progress: number; // 0-100
  basis: "pontos" | "tasks"; // em que o % se baseia
  open: number; // tasks + stories ainda abertas
  blocked: { ref: number; subject: string; note: string }[]; // stories abertas com impedimento em que o dev atua
};

export type UnassignedItem = { id: number; ref: number; subject: string; status: string; color: string; closed: boolean; points?: number; storyRef?: number | null };
export type Unassigned = { stories: UnassignedItem[]; tasks: UnassignedItem[] };

export type SprintOverview = {
  totalPoints: number; closedPoints: number;
  stories: number; storiesDone: number;
  tasks: number; tasksDone: number;
  progress: number; expectedProgress: number | null;
  daysLeft: number | null; totalDays: number | null;
  byStatus: { name: string; color: string; count: number }[];
  unassignedStories: number; unassignedTasks: number;
};

/** Motivo do impedimento (ou "Bloqueado" se o Taiga não trouxe motivo); null se não está bloqueado. */
const blockedNote = (x: { is_blocked?: boolean; blocked_note?: string }) => (x.is_blocked ? x.blocked_note?.trim() || "Bloqueado" : null);

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function pickCurrentSprint(ms: TMilestone[]): TMilestone | null {
  if (!ms.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const open = ms.filter((m) => !m.closed);
  return (
    open.find((m) => m.estimated_start <= today && today <= m.estimated_finish) ??
    [...open].sort((a, b) => b.estimated_start.localeCompare(a.estimated_start))[0] ??
    [...ms].sort((a, b) => b.estimated_start.localeCompare(a.estimated_start))[0]
  );
}

export function buildViews(members: TMember[], stories: TStory[], tasks: TTask[], sprint: TMilestone, known: Map<number, { name: string; photo: string | null }> = new Map()) {
  const devs = new Map<number, DevView>();
  const ensure = (id: number, name?: string) => {
    let d = devs.get(id);
    if (!d) {
      const m = members.find((x) => x.user === id);
      d = { userId: id, name: m?.full_name ?? known.get(id)?.name ?? name ?? `Usuário ${id}`, photo: m?.photo ?? known.get(id)?.photo ?? null, role: m ? m.role_name : "Fora do projeto",
        stories: [], tasks: [], points: 0, closedPoints: 0, tasksDone: 0, progress: 0, basis: "tasks", open: 0, blocked: [] };
      devs.set(id, d);
    }
    return d;
  };
  members.filter((m) => m.user && m.is_active).forEach((m) => ensure(m.user!));

  const storyByd = new Map(stories.map((s) => [s.id, s]));
  let unassignedStories = 0, unassignedTasks = 0;
  const unassigned: Unassigned = { stories: [], tasks: [] };

  for (const s of stories) {
    const owners = s.assigned_users?.length ? s.assigned_users : s.assigned_to ? [s.assigned_to] : [];
    if (!owners.length) {
      unassignedStories++;
      unassigned.stories.push({ id: s.id, ref: s.ref, subject: s.subject, status: s.status_extra_info.name, color: s.status_extra_info.color, closed: s.is_closed, points: s.total_points ?? 0 });
    }
    const share = (s.total_points ?? 0) / Math.max(owners.length, 1);
    for (const o of owners) {
      const d = ensure(o);
      d.stories.push({ id: s.id, ref: s.ref, subject: s.subject, status: s.status_extra_info.name, color: s.status_extra_info.color, closed: s.is_closed, points: share, role: "responsável", blocked: blockedNote(s) });
      d.points += share;
      if (s.is_closed) d.closedPoints += share;
    }
  }

  for (const t of tasks) {
    if (!t.assigned_to) {
      unassignedTasks++;
      unassigned.tasks.push({ id: t.id, ref: t.ref, subject: t.subject, status: t.status_extra_info.name, color: t.status_extra_info.color, closed: t.is_closed, storyRef: (t.user_story ? storyByd.get(t.user_story)?.ref : null) ?? null });
      continue;
    }
    const d = ensure(t.assigned_to);
    const parent = t.user_story ? storyByd.get(t.user_story) : undefined;
    d.tasks.push({ id: t.id, ref: t.ref, subject: t.subject, status: t.status_extra_info.name, color: t.status_extra_info.color, closed: t.is_closed, storyRef: parent?.ref ?? null, blocked: blockedNote(t) });
    if (t.is_closed) d.tasksDone++;
    // dev envolvido na story via task, mesmo sem ser responsável
    if (parent && !d.stories.some((x) => x.id === parent.id)) {
      d.stories.push({ id: parent.id, ref: parent.ref, subject: parent.subject, status: parent.status_extra_info.name, color: parent.status_extra_info.color, closed: parent.is_closed, points: 0, role: "via task", blocked: blockedNote(parent) });
    }
  }

  const list = [...devs.values()];
  for (const d of list) {
    // progresso: tasks quando existem; senão pontos das stories
    d.blocked = d.stories.filter((x) => x.blocked && !x.closed).map((x) => ({ ref: x.ref, subject: x.subject, note: x.blocked as string }));
    d.open = d.tasks.filter((t) => !t.closed).length + d.stories.filter((x) => !x.closed && x.role === "responsável").length;
    // Pontos das stories são o critério principal (mesmo do resumo da sprint);
    // sem pontos, usa as tasks.
    d.basis = d.points > 0 ? "pontos" : "tasks";
    d.progress = d.basis === "pontos" ? pct(d.closedPoints, d.points) : pct(d.tasksDone, d.tasks.length);
    d.points = Math.round(d.points * 10) / 10;
    d.closedPoints = Math.round(d.closedPoints * 10) / 10;
  }
  list.sort((a, b) => b.tasks.length + b.stories.length - (a.tasks.length + a.stories.length));

  // visão geral
  const totalPoints = stories.reduce((n, s) => n + (s.total_points ?? 0), 0);
  const closedPoints = stories.filter((s) => s.is_closed).reduce((n, s) => n + (s.total_points ?? 0), 0);
  const statusMap = new Map<string, { name: string; color: string; count: number }>();
  for (const s of stories) {
    const k = s.status_extra_info.name;
    const e = statusMap.get(k) ?? { name: k, color: s.status_extra_info.color, count: 0 };
    e.count++; statusMap.set(k, e);
  }
  const start = new Date(sprint.estimated_start).getTime();
  const end = new Date(sprint.estimated_finish).getTime();
  const now = Date.now();
  const DAY = 86400000;
  const totalDays = Math.max(Math.round((end - start) / DAY) + 1, 1);
  const elapsed = Math.min(Math.max((now - start) / (end - start + DAY), 0), 1);

  const overview: SprintOverview = {
    totalPoints, closedPoints,
    stories: stories.length, storiesDone: stories.filter((s) => s.is_closed).length,
    tasks: tasks.length, tasksDone: tasks.filter((t) => t.is_closed).length,
    progress: totalPoints ? pct(closedPoints, totalPoints) : pct(stories.filter((s) => s.is_closed).length, stories.length),
    expectedProgress: Math.round(elapsed * 100),
    daysLeft: Math.max(Math.ceil((end + DAY - now) / DAY), 0), totalDays,
    byStatus: [...statusMap.values()],
    unassignedStories, unassignedTasks,
  };
  const byRef = (a: UnassignedItem, b: UnassignedItem) => Number(a.closed) - Number(b.closed) || a.ref - b.ref; // abertos primeiro
  unassigned.stories.sort(byRef); unassigned.tasks.sort(byRef);
  return { devs: list, overview, unassigned };
}
