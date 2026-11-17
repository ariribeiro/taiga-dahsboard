import type { TMember, TMilestone, TStory, TTask } from "@/lib/taiga";

export const st = (name: string, color = "#999") => ({ name, color });

export const member = (user: number | null, full_name: string, role_name: string, extra: Partial<TMember> = {}): TMember =>
  ({ user, full_name, photo: null, role_name, is_active: true, ...extra });

export const story = (id: number, o: Partial<TStory> = {}): TStory => ({
  id, ref: id, subject: `Story ${id}`, assigned_to: null, assigned_users: [],
  status_extra_info: st("Novo"), is_closed: false, total_points: null, ...o,
});

export const task = (id: number, o: Partial<TTask> = {}): TTask => ({
  id, ref: 200 + id, subject: `Task ${id}`, user_story: null, assigned_to: null,
  status_extra_info: st("Novo"), is_closed: false, ...o,
});

export const sprint = (o: Partial<TMilestone> = {}): TMilestone => ({
  id: 1, name: "Sprint 1", slug: "s1", estimated_start: "2026-11-02", estimated_finish: "2026-11-15",
  closed: false, total_points: null, closed_points: null, ...o,
});
