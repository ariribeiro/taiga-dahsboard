import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { get, login, startStack, unique, type Stack } from "./helpers";

let s: Stack, sid: string;
beforeAll(async () => { s = await startStack(); sid = (await login(s.app, unique("u"))).sid; });
afterAll(async () => { await s.stop(); });

const json = async (url: string) => (await get(s.app, url, sid)).json();

describe("projetos e controle de acesso (papel Servidor Dirti/Fiscal)", () => {
  it("lista os projetos em que a pessoa tem o papel", async () => {
    const r = await get(s.app, "/projects", sid);
    expect(r.statusCode).toBe(200);
    const { projects } = r.json() as { projects: { name: string }[] };
    expect(projects).toHaveLength(10);
    expect(projects[0].name).toBe("Projeto Alfa");
  });

  it("a versão com cache (?cache=1) devolve a mesma lista", async () => {
    expect((await json("/projects?cache=1")).projects).toHaveLength(10);
  });

  it("projeto em que a pessoa não é Servidor/Fiscal: 403 em sprint, kanban e itens", async () => {
    for (const url of ["/projects/77/sprint", "/projects/77/kanban", "/items?kind=us&id=1&project=77"])
      expect((await get(s.app, url, sid)).statusCode, url).toBe(403);
    expect((await get(s.app, "/projects/1/sprint", sid)).statusCode).toBe(200);
  });

  it("id de projeto inválido: 400", async () => {
    for (const id of ["abc", "1;drop", "1.5", "-1", "9".repeat(12)])
      expect((await get(s.app, `/projects/${id}/sprint`, sid)).statusCode, id).toBe(400);
  });
});

describe("sprint (Scrum)", () => {
  it("devolve resumo, ritmo, devs só dos papéis permitidos, burndown e a configuração para o front", async () => {
    const d = await json("/projects/1/sprint?stats=1");
    expect(d.kind).toBe("scrum");
    expect(d.sprint.name).toBe("Sprint 12");
    expect(d.pace).toMatchObject({ state: expect.stringMatching(/ahead|late|ok/) });
    expect(d.devs.map((x: { name: string }) => x.name).sort()).toEqual(["Ana Souza", "Bruno Lima", "Eva Rocha", "Gil Semcampo"]);
    const blocked = (n: string) => d.devs.find((x: { name: string }) => x.name === n).blocked.length;
    expect(blocked("Ana Souza")).toBeGreaterThan(0);
    expect(blocked("Eva Rocha")).toBe(0);
    expect(d.overview.totalPoints).toBe(21);
    expect(d.unassigned.stories.map((x: { subject: string }) => x.subject)).toContain("Exportar CSV");
    expect(d.stats.days.length).toBeGreaterThan(0);
    expect(d.meta).toMatchObject({ webBase: "https://taiga.exemplo.com", paceTolerance: 10, staleDays: 7 });
    expect(d.meta.roles).toContain("Desenvolvedor");
    expect(d).not.toHaveProperty("members");                       // dados brutos de membros não vazam
  });

  it("sem ?stats=1 não busca o burndown", async () => {
    expect((await json("/projects/1/sprint")).stats).toBeNull();
  });

  it("escolhe a sprint pelo parâmetro; valor desconhecido volta à sprint atual", async () => {
    expect((await json("/projects/1/sprint?sprint=9")).pace.state).toBe("closed");
    expect((await json("/projects/1/sprint?sprint=999")).sprint.name).toBe("Sprint 12");
  });

  it("projeto Kanban: indica o tipo para o front pedir o quadro", async () => {
    expect(await json("/projects/10/sprint")).toMatchObject({ kind: "kanban", project: { id: 10 } });
  });

  it("Scrum ligado, mas sem sprints (e Kanban ativo): também é visão de fluxo", async () => {
    expect((await json("/projects/9/sprint")).kind).toBe("kanban");
  });
});

describe("Kanban", () => {
  it("quadro com totais por coluna (o total de finalizados vem do cabeçalho de contagem) e métricas", async () => {
    const d = await json("/projects/10/kanban?days=28");
    const col = (n: string) => d.board.find((c: { name: string }) => c.name === n);
    expect(col("NOVO").count).toBe(4);
    expect(col("FINALIZADO").count).toBe(300);
    expect(col("ARQUIVADO").count).toBe(0);
    expect(col("EM ANDAMENTO")).toMatchObject({ count: 4, wipLimit: 3 });
    expect(d.metrics.throughput).toHaveLength(4);                     // 28 dias = 4 semanas
    expect(d.metrics.wip).toBeGreaterThan(0);
    expect(d.days).toBe(28);
    expect(d.partial).toBe(false);
  });

  it("o cache dos concluídos é separado por projeto: um projeto nunca recebe os dados de outro", async () => {
    // O simulador devolve 300 concluídos só para o projeto 10; os demais projetos recebem a lista curta de stories.
    expect((await json("/projects/10/kanban")).doneTotal).toBe(300);
    const outro = await json("/projects/1/kanban");
    expect(outro.doneTotal).not.toBe(300);
    expect(outro.project.id).toBe(1);
    expect((await json("/projects/10/kanban")).doneTotal).toBe(300);            // continua certo, agora vindo do cache
    expect([...(globalThis as unknown as { __kanbanDone: Map<string, unknown> }).__kanbanDone.keys()].sort()).toEqual(["1", "10"]);
  });

  it("o período segue a lista permitida; valor inválido volta ao padrão", async () => {
    expect((await json("/projects/10/kanban?days=84")).metrics.throughput).toHaveLength(12);
    expect((await json("/projects/10/kanban?days=15")).days).toBe(28);
  });
});

describe("detalhe de story/task", () => {
  it("rejeita parâmetros inválidos", async () => {
    for (const q of ["kind=x&id=1&project=1", "kind=us&id=abc&project=1", "kind=us&id=1&project=1;drop", "kind=us&id=1.5&project=1", "kind=us&project=1", "kind=us&id=1"])
      expect((await get(s.app, `/items?${q}`, sid)).statusCode, q).toBe(400);
  });

  it("o item precisa ser do projeto informado, mesmo que a pessoa tenha acesso ao outro projeto", async () => {
    // O usuário de serviço enxerga tudo: sem essa conferência, bastaria trocar ?project= por um projeto liberado.
    expect((await get(s.app, "/items?kind=us&id=2&project=1", sid)).statusCode).toBe(200);
    expect((await get(s.app, "/items?kind=us&id=2&project=2", sid)).statusCode).toBe(404);
    expect((await get(s.app, "/items?kind=task&id=1&project=3", sid)).statusCode).toBe(404);
  });

  it("monta o detalhe: link para o Taiga, tasks filhas, comentários e anexos", async () => {
    const d = await json("/items?kind=us&id=2&project=1");
    expect(d).toMatchObject({ kind: "us", ref: 102, webUrl: "https://taiga.exemplo.com/project/projeto-alfa/us/102", blocked: "Aguardando API de dados" });
    expect(d.children.length).toBeGreaterThan(0);
    expect(d.comments[0].user).toBe("Bruno Lima");
    expect(d.assignees.map((a: { name: string }) => a.name)).toContain("Bruno Lima");
  });

  it("anexos com esquema perigoso (javascript:, ftp:) e os obsoletos são descartados", async () => {
    const d = await json("/items?kind=us&id=2&project=1");
    const names = d.attachments.map((a: { name: string }) => a.name);
    expect(names).not.toContain("malicioso.png");
    expect(names).not.toContain("ftp.pdf");
    expect(names).not.toContain("antigo.png");
    for (const a of d.attachments) expect(a.url).toMatch(/^https?:\/\//);
  });
});
