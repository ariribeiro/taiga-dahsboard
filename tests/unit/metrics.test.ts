import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLOCKED_STATUS_PATTERN, PACE_TOLERANCE, blockedNote, buildViews, paceOf, pickCurrentSprint } from "@/domain/metrics";
import { member, sprint, st, story, task } from "./fixtures";

beforeEach(() => { delete process.env.DEV_ROLES; });
afterEach(() => { vi.useRealTimers(); delete process.env.DEV_ROLES; });

describe("paceOf (ritmo da sprint)", () => {
  it("tolerância de 10 p.p. para cada lado", () => {
    expect(PACE_TOLERANCE).toBe(10);
    expect(paceOf(60, 49, false).state).toBe("ahead");   // +11
    expect(paceOf(59, 49, false).state).toBe("ok");      // +10 exatos
    expect(paceOf(39, 49, false).state).toBe("ok");      // -10 exatos
    expect(paceOf(38, 49, false).state).toBe("late");    // -11
  });
  it("devolve a diferença em pontos percentuais", () => {
    expect(paceOf(72, 49, false)).toEqual({ state: "ahead", diff: 23 });
    expect(paceOf(31, 55, false)).toEqual({ state: "late", diff: -24 });
  });
  it("sprint fechada não é comparada; sem esperado fica no ritmo", () => {
    expect(paceOf(10, 90, true).state).toBe("closed");
    expect(paceOf(80, null, false).state).toBe("ok");
  });
});

describe("blockedNote (impedimento)", () => {
  it("bloqueio nativo traz o motivo, ou 'Bloqueado' sem motivo", () => {
    expect(blockedNote({ is_blocked: true, blocked_note: " Aguardando API ", status_extra_info: st("Novo") })).toBe("Aguardando API");
    expect(blockedNote({ is_blocked: true, status_extra_info: st("Novo") })).toBe("Bloqueado");
  });
  it("reconhece status de impedimento sem diferenciar maiúsculas", () => {
    for (const n of ["IMPEDIMENTO", "Impedido", "bloqueada", "Blocked"])
      expect(blockedNote({ status_extra_info: st(n) }), n).toBe(`Status: ${n}`);
  });
  it("status normais não são impedimento", () => {
    for (const n of ["Novo", "Em andamento", "Pronto para teste", "Finalizado"]) expect(blockedNote({ status_extra_info: st(n) }), n).toBeNull();
  });
  it("expõe o padrão usado", () => { expect(BLOCKED_STATUS_PATTERN).toContain("imped"); });
});

describe("pickCurrentSprint", () => {
  const s1 = sprint({ id: 1, estimated_start: "2026-10-05", estimated_finish: "2026-10-18", closed: true });
  const s2 = sprint({ id: 2, estimated_start: "2026-11-02", estimated_finish: "2026-11-15" });
  const s3 = sprint({ id: 3, estimated_start: "2026-11-16", estimated_finish: "2026-11-29" });
  it("escolhe a sprint aberta que contém hoje", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    expect(pickCurrentSprint([s1, s2, s3])?.id).toBe(2);
  });
  it("sem sprint em curso, pega a aberta mais recente", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-20T12:00:00Z"));
    expect(pickCurrentSprint([s1, s2, s3])?.id).toBe(3);
  });
  it("com tudo fechado, pega a mais recente; sem sprints, null", () => {
    expect(pickCurrentSprint([s1, { ...s2, closed: true }])?.id).toBe(2);
    expect(pickCurrentSprint([])).toBeNull();
  });
});

describe("buildViews", () => {
  const members = [
    member(1, "Ana", "Desenvolvedor"), member(2, "Bruno", "Analista de negócios e requisitos"),
    member(3, "Carla", "Product Owner"), member(4, "Eva", "ANALISTA DE TESTE DE QUALIDADE"),
    member(5, "Fabio", "Arquiteto", { is_active: false }), member(null, "convite@x.com", "Desenvolvedor", { is_active: false }),
    member(6, "Gil", "ESTAGIÁRIO", { is_active: undefined }),   // resposta sem o campo is_active
  ];
  const spr = sprint();
  const names = (v: ReturnType<typeof buildViews>) => v.devs.map((d) => d.name).sort();

  it("progresso por pontos das stories de que é responsável", () => {
    const v = buildViews(members, [story(1, { assigned_to: 1, assigned_users: [1], total_points: 5, is_closed: true }), story(2, { assigned_to: 1, assigned_users: [1], total_points: 5 })], [], spr);
    const ana = v.devs.find((d) => d.name === "Ana")!;
    expect(ana).toMatchObject({ points: 10, closedPoints: 5, progress: 50, basis: "pontos" });
  });
  it("sem pontos, usa as tasks", () => {
    const v = buildViews(members, [], [task(1, { assigned_to: 2, is_closed: true }), task(2, { assigned_to: 2 }), task(3, { assigned_to: 2 })], spr);
    expect(v.devs.find((d) => d.name === "Bruno")).toMatchObject({ basis: "tasks", progress: 33, tasksDone: 1 });
  });
  it("divide os pontos de stories compartilhadas", () => {
    const v = buildViews(members, [story(1, { assigned_to: 1, assigned_users: [1, 2], total_points: 8 })], [], spr);
    expect(v.devs.find((d) => d.name === "Ana")!.points).toBe(4);
    expect(v.devs.find((d) => d.name === "Bruno")!.points).toBe(4);
  });
  it("quem só tem task numa story aparece 'via task', sem pontos", () => {
    const v = buildViews(members, [story(1, { assigned_to: 1, assigned_users: [1], total_points: 3 })], [task(1, { assigned_to: 2, user_story: 1 })], spr);
    const bruno = v.devs.find((d) => d.name === "Bruno")!;
    expect(bruno.stories).toEqual([expect.objectContaining({ id: 1, role: "via task", points: 0 })]);
  });

  describe("quem ganha card", () => {
    it("só membros ativos com os papéis configurados (com ou sem atividade)", () => {
      const v = buildViews(members, [story(1, { assigned_to: 3, assigned_users: [3] })], [task(1, { assigned_to: 99 })], spr);
      expect(names(v)).toEqual(["Ana", "Bruno", "Eva", "Gil"]);   // fora: PO, inativo sem itens, convite pendente, não-membro
    });
    it("membro inativo só some quando não tem itens na sprint", () => {
      const v = buildViews(members, [story(2, { assigned_to: 5, assigned_users: [5] })], [], spr);
      expect(names(v)).toContain("Fabio");                        // inativo, mas com item e papel permitido
    });
    it("membro sem o campo is_active conta como ativo", () => {
      expect(names(buildViews(members, [], [], spr))).toContain("Gil");
    });
    it("DEV_ROLES=* mostra todos, inclusive quem não é do projeto", () => {
      process.env.DEV_ROLES = "*";
      const v = buildViews(members, [story(1, { assigned_to: 3, assigned_users: [3] })], [task(1, { assigned_to: 99 })], spr, new Map([[99, { name: "Diego", photo: null }]]));
      expect(names(v)).toEqual(expect.arrayContaining(["Carla", "Diego"]));
      expect(v.devs.find((d) => d.name === "Diego")!.role).toBe("Fora do projeto");
    });
    it("sem papel enviado pelo Taiga, não filtra ninguém", () => {
      const semPapel = members.map((m) => ({ ...m, role_name: "" }));
      expect(names(buildViews(semPapel, [], [], spr)).length).toBeGreaterThan(3);
    });
  });

  describe("impedimento", () => {
    const blocked = story(1, { assigned_to: 1, assigned_users: [1], status_extra_info: st("IMPEDIMENTO") });
    it("status de impedimento marca o responsável e quem só tem task nela", () => {
      const v = buildViews(members, [blocked], [task(1, { assigned_to: 2, user_story: 1 })], spr);
      expect(v.devs.find((d) => d.name === "Ana")!.blocked).toHaveLength(1);
      expect(v.devs.find((d) => d.name === "Bruno")!.blocked).toHaveLength(1);
      expect(v.devs.find((d) => d.name === "Eva")!.blocked).toHaveLength(0);
    });
    it("bloqueio nativo também conta, com o motivo", () => {
      const v = buildViews(members, [story(2, { assigned_to: 1, assigned_users: [1], is_blocked: true, blocked_note: "Falta acesso" })], [], spr);
      expect(v.devs.find((d) => d.name === "Ana")!.blocked[0]).toMatchObject({ note: "Falta acesso" });
    });
    it("story concluída não conta como impedimento", () => {
      const v = buildViews(members, [{ ...blocked, is_closed: true }], [], spr);
      expect(v.devs.find((d) => d.name === "Ana")!.blocked).toHaveLength(0);
    });
  });

  describe("visão geral", () => {
    it("totais, status e itens sem responsável", () => {
      vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
      const v = buildViews(members,
        [story(1, { assigned_to: 1, assigned_users: [1], total_points: 5, is_closed: true, status_extra_info: st("Pronto") }),
         story(2, { total_points: 3 }), story(3, { assigned_to: 2, assigned_users: [2], total_points: 2 })],
        [task(1, { assigned_to: 1, is_closed: true }), task(2), task(3, { user_story: 2 })], spr);
      expect(v.overview).toMatchObject({ totalPoints: 10, closedPoints: 5, progress: 50, stories: 3, storiesDone: 1, tasks: 3, tasksDone: 1,
        unassignedStories: 1, unassignedTasks: 2, expectedProgress: 50, daysLeft: 7, totalDays: 14 });
      expect(v.unassigned.stories.map((s) => s.ref)).toEqual([2]);
      expect(v.unassigned.tasks.map((t) => t.ref)).toEqual([202, 203]);      // ordenadas por ref
      expect(v.overview.byStatus.find((s) => s.name === "Pronto")!.count).toBe(1);
    });
    it("sem pontos, o progresso vira stories concluídas ÷ total", () => {
      const v = buildViews(members, [story(1, { is_closed: true }), story(2), story(3), story(4)], [], spr);
      expect(v.overview.progress).toBe(25);
    });
  });
});
