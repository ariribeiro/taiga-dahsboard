import { getMembers, getUsStatuses, taigaGet, taigaGetPaged, TaigaError, type TStory } from "../infra/taiga";
import { classifyStatuses, type KStatus } from "../domain/kanban-metrics";

const PAGE = 100;      // itens por página nos concluídos
const MAX_PAGES = 5;   // teto de páginas por coluna concluída (até 500 itens mais recentes)
const TTL = 10 * 60_000;

type DoneCache = { done: TStory[]; doneTotal: number; archivedTotal: number; ordered: boolean; partial: boolean; counts: Record<number, number> };
const g = globalThis as unknown as { __kanbanDone?: Map<string, { at: number; v: DoneCache }> };
const cache = (g.__kanbanDone ??= new Map());

/** Concluídos de uma coluna: total (cabeçalho x-pagination-count) + as páginas mais recentes. */
async function loadDoneColumn(pid: number, sid: number) {
  const url = (page: number, order: boolean) =>
    `/userstories?project=${pid}&status=${sid}&page=${page}&page_size=${PAGE}${order ? "&order_by=-modified_date" : ""}`;
  let ordered = true;
  let first;
  try { first = await taigaGetPaged<TStory[]>(url(1, true)); }
  catch (e) {
    // algumas instâncias recusam order_by: segue sem ordenar (a página avisa quando a amostra é parcial)
    if (e instanceof TaigaError && e.status === 400) { ordered = false; first = await taigaGetPaged<TStory[]>(url(1, false)); } else throw e;
  }
  const total = first.count;
  const pages = first.data.length >= total ? 1 : Math.min(Math.ceil(total / PAGE), MAX_PAGES);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => taigaGetPaged<TStory[]>(url(i + 2, ordered)).then((r) => r.data)));
  const done = [first.data, ...rest].flat();
  return { done, total, ordered };
}

async function loadDone(pid: number, statuses: Omit<KStatus, "count">[]): Promise<DoneCache> {
  // os dados vêm do usuário de serviço, iguais para todo mundo: o cache é por projeto
  const key = String(pid);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v;

  const doneCols = statuses.filter((s) => s.kind === "done");
  const archCols = statuses.filter((s) => s.kind === "archived");
  const [doneRes, archCounts] = await Promise.all([
    Promise.all(doneCols.map((c) => loadDoneColumn(pid, c.id))),
    // arquivados: só a contagem (página de 1 item)
    Promise.all(archCols.map((c) => taigaGetPaged<TStory[]>(`/userstories?project=${pid}&status=${c.id}&page=1&page_size=1`).then((r) => r.count))),
  ]);
  const done = doneRes.flatMap((r) => r.done);
  const doneTotal = doneRes.reduce((n, r) => n + r.total, 0);
  const counts: Record<number, number> = {};
  doneCols.forEach((c, i) => { counts[c.id] = doneRes[i].total; });
  archCols.forEach((c, i) => { counts[c.id] = archCounts[i]; });
  const v: DoneCache = {
    done, doneTotal, archivedTotal: archCounts.reduce((n, c) => n + c, 0), counts,
    ordered: doneRes.every((r) => r.ordered), partial: done.length < doneTotal,
  };
  cache.set(key, { at: Date.now(), v });
  return v;
}

/** Dados do quadro Kanban: colunas abertas completas; concluídas só contagem + amostra recente. */
export async function loadKanban(pid: number) {
  const [members, rawStatuses] = await Promise.all([getMembers(pid), getUsStatuses(pid)]);
  const statuses = classifyStatuses(rawStatuses);
  const openCols = statuses.filter((s) => s.kind === "queue" || s.kind === "wip");

  const [openLists, doneData] = await Promise.all([
    Promise.all(openCols.map((c) => taigaGet<TStory[]>(`/userstories?project=${pid}&status=${c.id}`))),
    loadDone(pid, statuses),
  ]);
  const open = openLists.flat();
  const counts = new Map<number, number>(openCols.map((c, i) => [c.id, openLists[i].length]));
  const withCount: KStatus[] = statuses.map((s) => ({ ...s, count: doneData.counts[s.id] ?? counts.get(s.id) ?? 0 }));
  return { members, statuses: withCount, open, ...doneData };
}
