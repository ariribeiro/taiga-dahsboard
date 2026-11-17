import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { get, login, setMode, startStack, unique, type Stack } from "./helpers";

// Taiga simulado com 800 finalizados, timeout de 1,5 s e no máximo 3 chamadas simultâneas.
let s: Stack, sid: string;
beforeAll(async () => {
  s = await startStack({ mockEnv: { MOCK_DONE: "800" }, env: { TAIGA_TIMEOUT_MS: "1500", TAIGA_MAX_CONCURRENCY: "3" } });
  sid = (await login(s.app, unique("u"))).sid;
});
afterAll(async () => { await s.stop(); });
beforeEach(async () => { await fetch(`${s.mock}/__reset`); });

describe("falhas do Taiga", () => {
  it("Taiga travado: responde 504 em poucos segundos (sem ficar pendurado) e o resto da API segue funcionando", async () => {
    await setMode(s.mock, { hang: "/milestones" });
    const t0 = Date.now();
    const r = await get(s.app, "/projects/1/sprint", sid);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.statusCode).toBe(504);
    expect(r.json()).toEqual({ error: "TIMEOUT" });
    await setMode(s.mock, { hang: null });
    expect((await get(s.app, "/projects", sid)).statusCode).toBe(200);
  });

  it("histórico travado: o detalhe ainda abre, sem comentários", async () => {
    await setMode(s.mock, { hang: "/history" });
    const t0 = Date.now();
    const r = await get(s.app, "/items?kind=us&id=2&project=1", sid);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r.statusCode).toBe(200);
    expect(r.json().comments).toEqual([]);
  });

  it("falha temporária (503 na 1ª chamada de cada endereço): a sprint carrega", async () => {
    await setMode(s.mock, { flaky: true });
    expect((await get(s.app, "/projects/1/sprint", sid)).statusCode).toBe(200);
  });

  it("limita as requisições simultâneas ao Taiga (máximo 3)", async () => {
    await setMode(s.mock, { delayMs: 150 });
    expect((await get(s.app, "/projects/1/sprint", sid)).statusCode).toBe(200);   // a sprint dispara várias chamadas em paralelo
    const { maxInflight } = await (await fetch(`${s.mock}/__stats`)).json() as { maxInflight: number };
    expect(maxInflight).toBeGreaterThan(0);
    expect(maxInflight).toBeLessThanOrEqual(3);
  });

  it("Kanban com muitos finalizados e Taiga sem ordenação: avisa que a amostra é parcial e não inventa números", async () => {
    await setMode(s.mock, { noOrder: true });
    const d = (await get(s.app, "/projects/10/kanban?days=28", sid)).json();
    expect(d.board.find((c: { name: string }) => c.name === "FINALIZADO").count).toBe(800);   // o total vem do cabeçalho
    expect(d).toMatchObject({ ordered: false, partial: true, doneTotal: 800 });
    expect(d.metrics.doneInWindow).toBeNull();
  });
});
