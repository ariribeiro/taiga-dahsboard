import type { TMember, TStory, TUsStatus } from "./taiga";
import { blockedNote } from "./metrics";
import { allowedRoleSet, normRole } from "./roles";

export type StatusKind = "queue" | "wip" | "done" | "archived";
export type KStatus = { id: number; name: string; color: string; order: number; kind: StatusKind; wipLimit: number | null; count: number };

const DAY = 86_400_000;

/** Fila (primeira coluna aberta), em andamento (demais abertas), concluídas e arquivadas. */
export function classifyStatuses(raw: TUsStatus[]): Omit<KStatus, "count">[] {
  const sorted = [...raw].sort((a, b) => a.order - b.order);
  let queueTaken = false;
  return sorted.map((s) => {
    const archived = s.is_archived === true || (s.is_archived === undefined && s.is_closed && /arquiv|archiv/i.test(s.name));
    let kind: StatusKind;
    if (archived) kind = "archived";
    else if (s.is_closed) kind = "done";
    else if (!queueTaken) { kind = "queue"; queueTaken = true; }
    else kind = "wip";
    return { id: s.id, name: s.name, color: s.color, order: s.order, kind, wipLimit: s.wip_limit && s.wip_limit > 0 ? s.wip_limit : null };
  });
}

export type KItem = { id: number; ref: number; subject: string; status: string; color: string; days: number; stale: boolean; blocked: string | null; owners: string[] };
export type KDev = {
  userId: number; name: string; photo: string | null; role: string;
  wip: number; blocked: number; stale: number; done: number; wipPoints: number; donePoints: number; items: KItem[];
};
export type KanbanMetrics = {
  days: number; staleDays: number;
  wip: number; queue: number; blocked: number; stale: number; unassignedWip: number;
  doneInWindow: number | null; donePoints: number; leadMedian: number | null; leadP85: number | null;
  prevDone: number | null; windowIncomplete: boolean; hasPoints: boolean;
  throughput: { label: string; count: number }[];
  aging: KItem[]; blockedItems: KItem[]; devs: KDev[];
};

export type KanbanInput = {
  statuses: KStatus[]; open: TStory[]; done: TStory[];
  doneTotal: number; ordered: boolean; partial: boolean;
  members: TMember[]; days: number; staleDays: number; now?: number;
};

const t = (s?: string | null) => (s ? new Date(s).getTime() : NaN);
const finishedAt = (s: TStory) => { const f = t(s.finish_date); return Number.isFinite(f) ? f : t(s.modified_date); };
const round1 = (n: number) => Math.round(n * 10) / 10;

function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1))];
}

export function kanbanMetrics(inp: KanbanInput): KanbanMetrics {
  const now = inp.now ?? Date.now();
  const since = now - inp.days * DAY;
  const kindOf = new Map(inp.statuses.map((s) => [s.id, s.kind]));
  const name = new Map<number, { name: string; photo: string | null; role: string }>(
    inp.members.filter((m) => m.user).map((m) => [m.user as number, { name: m.full_name, photo: m.photo, role: m.role_name }]));
  const ownersOf = (s: TStory) => (s.assigned_users?.length ? s.assigned_users : s.assigned_to ? [s.assigned_to] : []);
  const ownerName = (id: number, s: TStory) => name.get(id)?.name ?? (id === s.assigned_to ? s.assigned_to_extra_info?.full_name_display : undefined) ?? `Usuário ${id}`;

  // ---- itens em andamento (colunas abertas, exceto a fila) ----
  const wipStories = inp.open.filter((s) => (s.status != null ? kindOf.get(s.status) : "wip") === "wip");
  const queue = inp.open.length - wipStories.length;
  const toItem = (s: TStory): KItem => {
    const days = Number.isFinite(t(s.modified_date)) ? Math.max(0, Math.floor((now - t(s.modified_date)) / DAY)) : 0;
    return {
      id: s.id, ref: s.ref, subject: s.subject, status: s.status_extra_info.name, color: s.status_extra_info.color,
      days, stale: days >= inp.staleDays, blocked: blockedNote(s), owners: ownersOf(s).map((o) => ownerName(o, s)),
    };
  };
  const items = new Map(wipStories.map((s) => [s.id, toItem(s)]));

  // ---- concluídos no período (vazão e tempo de entrega) ----
  const complete = !inp.partial || (inp.ordered && Math.min(...inp.done.map((s) => t(s.modified_date)).filter(Number.isFinite), Infinity) < since);
  const prevComplete = !inp.partial || (inp.ordered && Math.min(...inp.done.map((s) => t(s.modified_date)).filter(Number.isFinite), Infinity) < since - inp.days * DAY);
  const doneWin = inp.done.filter((s) => { const f = finishedAt(s); return f >= since && f <= now; });
  const lead = doneWin
    .map((s) => (finishedAt(s) - t(s.created_date)) / DAY).filter((n) => Number.isFinite(n)).map((n) => Math.max(0, n)).sort((a, b) => a - b);
  const prevDone = prevComplete ? inp.done.filter((s) => { const f = finishedAt(s); return f >= since - inp.days * DAY && f < since; }).length : null;

  const weeks = Math.max(1, Math.round(inp.days / 7));
  const throughput = Array.from({ length: weeks }, (_, i) => {
    const k = weeks - 1 - i, start = now - (k + 1) * 7 * DAY, end = now - k * 7 * DAY;
    return {
      label: new Date(start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      count: inp.done.filter((s) => { const f = finishedAt(s); return f >= start && (k === 0 ? f <= end : f < end); }).length,
    };
  });

  // ---- por pessoa (só papéis configurados, como na visão de sprint) ----
  const roles = allowedRoleSet();
  const hasRoles = inp.members.some((m) => m.role_name);
  const cards = new Map<number, KDev>();
  for (const m of inp.members) {
    if (!m.user || m.is_active === false || m.is_user_active === false) continue;
    if (roles && hasRoles && !roles.has(normRole(m.role_name))) continue;
    cards.set(m.user, { userId: m.user, name: m.full_name, photo: m.photo, role: m.role_name, wip: 0, blocked: 0, stale: 0, done: 0, wipPoints: 0, donePoints: 0, items: [] });
  }
  for (const s of wipStories) {
    const it = items.get(s.id)!;
    const owners = ownersOf(s);
    for (const o of owners) {
      const d = cards.get(o); if (!d) continue;
      d.wip++; d.items.push(it); d.wipPoints += (s.total_points ?? 0) / owners.length;
      if (it.blocked) d.blocked++;
      if (it.stale) d.stale++;
    }
  }
  for (const s of doneWin) {
    const owners = ownersOf(s);
    for (const o of owners) { const d = cards.get(o); if (!d) continue; d.done++; d.donePoints += (s.total_points ?? 0) / owners.length; }
  }
  const devs = [...cards.values()];
  for (const d of devs) { d.items.sort((a, b) => b.days - a.days); d.wipPoints = round1(d.wipPoints); d.donePoints = round1(d.donePoints); }
  devs.sort((a, b) => (b.wip + b.done) - (a.wip + a.done) || a.name.localeCompare(b.name));

  const all = [...items.values()];
  return {
    days: inp.days, staleDays: inp.staleDays,
    wip: wipStories.length, queue,
    blocked: all.filter((i) => i.blocked).length, stale: all.filter((i) => i.stale && !i.blocked).length,
    unassignedWip: wipStories.filter((s) => !ownersOf(s).length).length,
    doneInWindow: complete ? doneWin.length : null,
    donePoints: round1(doneWin.reduce((n, s) => n + (s.total_points ?? 0), 0)),
    leadMedian: lead.length ? round1(percentile(lead, 0.5)!) : null, leadP85: lead.length ? round1(percentile(lead, 0.85)!) : null,
    prevDone, windowIncomplete: !complete, hasPoints: [...wipStories, ...doneWin].some((s) => (s.total_points ?? 0) > 0),
    throughput,
    aging: all.filter((i) => !i.blocked).sort((a, b) => b.days - a.days).slice(0, 8), // impedidos têm lista própria
    blockedItems: all.filter((i) => i.blocked).sort((a, b) => b.days - a.days),
    devs,
  };
}
