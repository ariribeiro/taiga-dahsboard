import { getMembers, getUser, taigaGet, TAIGA_URL } from "./taiga";
import type { ItemDetail } from "./item";
import { taigaWebLink } from "./links";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Item não pertence ao projeto informado (ou não existe). */
export class ItemNotFound extends Error {}

const nm = (u: any): string | null => u?.full_name_display || u?.full_name || u?.name || u?.username || null;

/**
 * Detalhe de uma story/task. Quem chama já conferiu que a pessoa tem acesso a `project`;
 * como a consulta usa o usuário de serviço (que enxerga mais), aqui exigimos que o item seja mesmo desse projeto.
 */
export async function loadItem(kind: "us" | "task", id: number, project: number): Promise<ItemDetail> {
  const base = kind === "us" ? "userstories" : "tasks";
  const hist = kind === "us" ? "userstory" : "task";

  const [it, members, history, children, atts] = await Promise.all([
    taigaGet<any>(`/${base}/${id}`),
    getMembers(project).catch(() => []),
    taigaGet<any[]>(`/history/${hist}/${id}`).catch(() => []),
    kind === "us" ? taigaGet<any[]>(`/tasks?user_story=${id}`).catch(() => []) : Promise.resolve([] as any[]),
    taigaGet<any[]>(`/${base}/attachments?object_id=${id}&project=${project}`).catch(() => [] as any[]),
  ]);
  if (Number(it.project) !== project) throw new ItemNotFound();

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

  // Endereço de download do anexo. O Taiga manda "url" (completa, às vezes com token) e "attached_file"
  // (às vezes só um caminho relativo ao MEDIA_ROOT, ex.: "attachments/a/b/hash/arquivo.pdf").
  const attUrl = (a: any): string => {
    // só aceita http(s) ou caminho relativo: descarta javascript:, data:, ftp: etc.
    const cands = ([a.url, a.attached_file].filter((v) => typeof v === "string" && v) as string[])
      .filter((v) => /^https?:\/\//i.test(v) || !/^[a-z][a-z0-9+.-]*:/i.test(v));
    const full = cands.find((v) => /^https?:\/\//i.test(v)) ?? cands.find((v) => v.startsWith("//"));
    if (full) return full.startsWith("//") ? "https:" + full : full;
    const rel = cands[0];
    if (!rel) return "";
    return rel.startsWith("/") ? new URL(rel, TAIGA_URL + "/").href : `${TAIGA_URL}/media/${rel}`;
  };
  const IMG = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|$)/i;
  const attachments = (atts ?? []).filter((a) => !a.is_deprecated).map((a) => ({
    id: a.id, name: String(a.name ?? "arquivo"), url: attUrl(a), size: Number(a.size ?? 0),
    isImage: IMG.test(String(a.name ?? "")) || IMG.test(String(a.attached_file ?? "")), description: String(a.description ?? ""),
  })).filter((a) => a.url);

  const slug: string | undefined = it.project_extra_info?.slug;
  return {
    kind, id, ref: it.ref, subject: it.subject,
    status: it.status_extra_info ? { name: it.status_extra_info.name, color: it.status_extra_info.color } : null,
    closed: !!(it.is_closed ?? it.status_extra_info?.is_closed),
    blocked: it.is_blocked ? String(it.blocked_note || "Bloqueado") : null,
    assignees, owner,
    points: kind === "us" ? (it.total_points ?? null) : null,
    dueDate: it.due_date ?? null,
    created: it.created_date ?? null, modified: it.modified_date ?? null, finished: it.finish_date ?? it.finished_date ?? null,
    description: String(it.description ?? ""),
    webUrl: taigaWebLink(slug, kind, it.ref),
    tags,
    parent: kind === "task" && it.user_story_extra_info ? { ref: it.user_story_extra_info.ref, subject: it.user_story_extra_info.subject, webUrl: taigaWebLink(slug, "us", it.user_story_extra_info.ref) } : null,
    children: children.map((t) => ({
      ref: t.ref, subject: t.subject, status: t.status_extra_info?.name ?? "", color: t.status_extra_info?.color ?? "#999",
      closed: !!t.is_closed, assignee: nm(t.assigned_to_extra_info), assigneePhoto: t.assigned_to_extra_info?.photo ?? null,
      webUrl: taigaWebLink(slug, "task", t.ref),
    })),
    baseUrl: TAIGA_URL, attachments, comments,
  };
}
