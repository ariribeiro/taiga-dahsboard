import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMembers, getUser, taigaGet, TaigaError, TAIGA_URL } from "@/lib/taiga";
import type { ItemDetail } from "@/lib/item";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";

const nm = (u: any): string | null => u?.full_name_display || u?.full_name || u?.name || u?.username || null;

export async function GET(req: Request) {
  if (!getSession()) return NextResponse.json({ error: "Sem sessão" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind"), id = Number(q.get("id")), project = Number(q.get("project"));
  if ((kind !== "us" && kind !== "task") || !Number.isInteger(id) || !Number.isInteger(project)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }
  const base = kind === "us" ? "userstories" : "tasks";
  const hist = kind === "us" ? "userstory" : "task";

  try {
    const [it, members, history, children, atts] = await Promise.all([
      taigaGet<any>(`/${base}/${id}`),
      getMembers(project).catch(() => []),
      taigaGet<any[]>(`/history/${hist}/${id}`).catch(() => []),
      kind === "us" ? taigaGet<any[]>(`/tasks?user_story=${id}`).catch(() => []) : Promise.resolve([] as any[]),
      taigaGet<any[]>(`/${base}/attachments?object_id=${id}&project=${project}`).catch(() => [] as any[]),
    ]);
    if (it.project && it.project !== project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const person = async (uid: number, extra?: any) => {
      const m = members.find((x) => x.user === uid);
      if (m) return { name: m.full_name, photo: m.photo };
      if (extra && nm(extra)) return { name: nm(extra)!, photo: extra.photo ?? null };
      const u = await getUser(uid).catch(() => null);
      return { name: (u && nm(u)) || `Usuário ${uid}`, photo: u?.photo ?? null };
    };

    const ids = new Set<number>([...(it.assigned_users ?? []), ...(it.assigned_to ? [it.assigned_to] : [])]);
    const assignees = await Promise.all([...ids].map((uid) => person(uid, uid === it.assigned_to ? it.assigned_to_extra_info : undefined)));
    const own = it.owner_extra_info ?? null;
    const owner = own && nm(own) ? { name: nm(own)!, photo: own.photo ?? null } : null;

    const tags = (it.tags ?? []).map((t: any) => Array.isArray(t) ? { name: String(t[0]), color: t[1] ?? null } : { name: String(t), color: null });

    const comments = (history ?? [])
      .filter((h) => h.comment && !h.delete_comment_date)
      .slice(-10)
      .map((h) => ({ user: h.user?.name || h.user?.username || "—", photo: h.user?.photo ?? null, date: h.created_at, text: String(h.comment) }));

    const abs = (u: string | null | undefined) => { if (!u) return ""; try { return new URL(u, TAIGA_URL + "/").href; } catch { return u; } };
    const IMG = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|$)/i;
    const attachments = (atts ?? []).filter((a) => !a.is_deprecated).map((a) => ({
      id: a.id, name: String(a.name ?? "arquivo"), url: abs(a.attached_file), size: Number(a.size ?? 0),
      isImage: IMG.test(String(a.name ?? "")) || IMG.test(String(a.attached_file ?? "")), description: String(a.description ?? ""),
    })).filter((a) => a.url);

    const out: ItemDetail = {
      kind, id, ref: it.ref, subject: it.subject,
      status: it.status_extra_info ? { name: it.status_extra_info.name, color: it.status_extra_info.color } : null,
      closed: !!(it.is_closed ?? it.status_extra_info?.is_closed),
      blocked: it.is_blocked ? String(it.blocked_note || "Bloqueado") : null,
      assignees, owner,
      points: kind === "us" ? (it.total_points ?? null) : null,
      dueDate: it.due_date ?? null,
      created: it.created_date ?? null, modified: it.modified_date ?? null, finished: it.finish_date ?? it.finished_date ?? null,
      description: String(it.description ?? ""),
      tags,
      parent: kind === "task" && it.user_story_extra_info ? { ref: it.user_story_extra_info.ref, subject: it.user_story_extra_info.subject } : null,
      children: children.map((t) => ({
        ref: t.ref, subject: t.subject, status: t.status_extra_info?.name ?? "", color: t.status_extra_info?.color ?? "#999",
        closed: !!t.is_closed, assignee: nm(t.assigned_to_extra_info), assigneePhoto: t.assigned_to_extra_info?.photo ?? null,
      })),
      baseUrl: TAIGA_URL, attachments, comments,
    };
    return NextResponse.json(out);
  } catch (e) {
    const status = e instanceof TaigaError && [401, 403, 404].includes(e.status) ? e.status : 502;
    return NextResponse.json({ error: status === 502 ? "Falha ao consultar o Taiga" : "Sem acesso ao item" }, { status });
  }
}
