import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyStatuses, kanbanMetrics, type KanbanInput, type KStatus } from "@/lib/kanban-metrics";
import type { TStory, TUsStatus } from "@/lib/taiga";
import { member, st, story } from "./fixtures";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16, 12);
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

beforeEach(() => { delete process.env.DEV_ROLES; });
afterEach(() => { delete process.env.DEV_ROLES; });

const RAW: TUsStatus[] = [
  { id: 1, name: "NOVO", color: "#999", order: 1, is_closed: false },
  { id: 2, name: "EM ANDAMENTO", color: "#e80", order: 2, is_closed: false, wip_limit: 3 },
  { id: 5, name: "IMPEDIMENTO", color: "#d00", order: 5, is_closed: false },
  { id: 6, name: "FINALIZADO", color: "#0a0", order: 6, is_closed: true },
  { id: 7, name: "ARQUIVADO", color: "#777", order: 7, is_closed: true, is_archived: true },
];
const statuses: KStatus[] = classifyStatuses(RAW).map((s) => ({ ...s, count: 0 }));

const open = (): TStory[] => [
  { ...story(1, { assigned_to: 10, assigned_users: [10], total_points: 3, modified_date: ago(2) }), status: 1, status_extra_info: st("NOVO") },
  { ...story(2, { assigned_to: 10, assigned_users: [10], total_points: 2, modified_date: ago(1) }), status: 2, status_extra_info: st("EM ANDAMENTO") },
  { ...story(3, { assigned_to: 11, assigned_users: [11], total_points: 5, modified_date: ago(12) }), status: 2, status_extra_info: st("EM ANDAMENTO") },
  { ...story(4, { modified_date: ago(20) }), status: 5, status_extra_info: st("IMPEDIMENTO") },
];
const done = (days: number[], leadDays = 4): TStory[] => days.map((d, i) => ({
  ...story(100 + i, { assigned_to: 10, assigned_users: [10], total_points: 1, is_closed: true, created_date: ago(d + leadDays), finish_date: ago(d), modified_date: ago(d) }),
  status: 6, status_extra_info: st("FINALIZADO"),
}));
const members = [member(10, "Ana", "Desenvolvedor"), member(11, "Bia", "Product Owner")];

const input = (o: Partial<KanbanInput> = {}): KanbanInput => ({
  statuses, open: open(), done: done([0, 3, 9, 15, 40]), doneTotal: 5, ordered: true, partial: false, members, days: 28, staleDays: 7, now: NOW, ...o,
});

describe("classifyStatuses", () => {
  it("fila, em andamento, concluída e arquivada", () => {
    expect(statuses.map((s) => `${s.name}:${s.kind}`)).toEqual(["NOVO:queue", "EM ANDAMENTO:wip", "IMPEDIMENTO:wip", "FINALIZADO:done", "ARQUIVADO:archived"]);
  });
  it("lê o limite de WIP quando existe", () => {
    expect(statuses.find((s) => s.name === "EM ANDAMENTO")!.wipLimit).toBe(3);
    expect(statuses.find((s) => s.name === "NOVO")!.wipLimit).toBeNull();
  });
  it("sem is_archived, reconhece coluna fechada chamada 'arquivado'", () => {
    const k = classifyStatuses([{ id: 1, name: "Novo", color: "", order: 1, is_closed: false }, { id: 2, name: "Arquivado", color: "", order: 2, is_closed: true }]);
    expect(k[1].kind).toBe("archived");
  });
});

describe("kanbanMetrics", () => {
  it("indicadores de fluxo", () => {
    expect(kanbanMetrics(input())).toMatchObject({ wip: 3, queue: 1, blocked: 1, stale: 1, unassignedWip: 1, doneInWindow: 4, prevDone: 1, leadMedian: 4, leadP85: 4, windowIncomplete: false });
  });
  it("vazão semanal: 4 semanas, sem perder o item concluído agora", () => {
    expect(kanbanMetrics(input()).throughput.map((w) => w.count)).toEqual([0, 1, 1, 2]);
  });
  it("tempo de entrega: mediana e percentil 85 (10 itens de 1 a 10 dias)", () => {
    const itens = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lead, i) => done([i + 1], lead)[0]);
    const m = kanbanMetrics(input({ done: itens.map((s, i) => ({ ...s, id: 500 + i })), doneTotal: 10 }));
    expect(m.leadMedian).toBe(5);   // posição 5 de 10 (nearest-rank)
    expect(m.leadP85).toBe(9);      // ceil(0,85 × 10) = 9ª posição
  });
  it("itens parados excluem os impedidos, e a lista de 'sem movimento' também", () => {
    const m = kanbanMetrics(input());
    expect(m.aging.map((i) => i.ref)).toEqual([3, 2]);            // por tempo parado, sem o impedido (ref 4)
    expect(m.blockedItems.map((i) => i.ref)).toEqual([4]);
  });
  it("só mostra cards de membros ativos com os papéis configurados", () => {
    const m = kanbanMetrics(input());
    expect(m.devs.map((d) => d.name)).toEqual(["Ana"]);            // Bia (Product Owner) fica de fora
    expect(m.devs[0]).toMatchObject({ wip: 1, done: 4, stale: 0 });
  });

  describe("amostra parcial dos concluídos", () => {
    it("ordenada e sem alcançar o início do período: não inventa o número", () => {
      const m = kanbanMetrics(input({ done: done([0, 3]), doneTotal: 300, partial: true }));
      expect(m.doneInWindow).toBeNull();
      expect(m.windowIncomplete).toBe(true);
    });
    it("sem ordenação: também não garante", () => {
      const m = kanbanMetrics(input({ done: done([0, 3]), doneTotal: 300, partial: true, ordered: false }));
      expect(m.doneInWindow).toBeNull();
      expect(m.windowIncomplete).toBe(true);
    });
    it("ordenada e já passou do início do período: o número é confiável", () => {
      const m = kanbanMetrics(input({ doneTotal: 300, partial: true }));
      expect(m.doneInWindow).toBe(4);
      expect(m.windowIncomplete).toBe(false);
    });
    it("a comparação com o período anterior só existe se a amostra o cobre", () => {
      expect(kanbanMetrics(input({ done: done([0, 3, 9, 15, 30]), doneTotal: 300, partial: true })).prevDone).toBeNull();
      expect(kanbanMetrics(input()).prevDone).toBe(1);
    });
  });

  it("DEV_ROLES=* mostra também quem tem outros papéis", () => {
    process.env.DEV_ROLES = "*";
    expect(kanbanMetrics(input()).devs.map((d) => d.name).sort()).toEqual(["Ana", "Bia"]);
  });
  it("itens parados há mais de staleDays viram 'stale'", () => {
    expect(kanbanMetrics(input({ staleDays: 30 })).stale).toBe(0);
    expect(kanbanMetrics(input({ staleDays: 1 })).stale).toBeGreaterThanOrEqual(2);
  });
});
