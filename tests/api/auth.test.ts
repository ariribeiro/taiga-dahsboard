import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { get, login, startStack, unique, type Stack } from "./helpers";

let s: Stack;
beforeAll(async () => { s = await startStack(); });
afterAll(async () => { await s.stop(); });

describe("login e sessão", () => {
  it("entra com a senha certa e devolve só a identidade (sem token do Taiga)", async () => {
    const { res, body, sid } = await login(s.app, unique("u"));
    expect(res.statusCode).toBe(200);
    expect(sid).toMatch(/^[0-9a-f]{64}$/);                       // 32 bytes aleatórios
    expect(body.user).toEqual({ userId: 1, fullName: "Ana Souza", username: expect.any(String), photo: expect.any(String) });
    expect(JSON.stringify(body)).not.toMatch(/tok|auth_token|refresh/);
    expect(body.maxAge).toBeGreaterThan(0);
  });

  it("senha errada: 401 CRED", async () => {
    const { res, body } = await login(s.app, unique("u"), "errada");
    expect(res.statusCode).toBe(401);
    expect(body.error).toBe("CRED");
  });

  it("corpo inválido: 400", async () => {
    for (const payload of [{}, { username: "a" }, { username: 1, password: "x" }, { username: "", password: "x" }, { username: "a", password: "x".repeat(2000) }]) {
      const r = await s.app.inject({ method: "POST", url: "/auth/login", payload });
      expect(r.statusCode, JSON.stringify(payload).slice(0, 40)).toBe(400);
    }
  });

  it("/me devolve quem está logado; sem sessão (ou com sessão inventada) é 401", async () => {
    const { sid } = await login(s.app, unique("u"));
    expect((await get(s.app, "/me", sid)).json()).toMatchObject({ userId: 1, fullName: "Ana Souza" });
    for (const t of [undefined, "0".repeat(64), "lixo"]) expect((await get(s.app, "/me", t)).statusCode, String(t)).toBe(401);
  });

  it("sem sessão, todas as rotas de dados respondem 401", async () => {
    for (const url of ["/projects", "/projects/1/sprint", "/projects/1/kanban", "/items?kind=us&id=1&project=1"])
      expect((await get(s.app, url)).statusCode, url).toBe(401);
  });

  it("logout encerra a sessão de verdade", async () => {
    const { sid } = await login(s.app, unique("u"));
    expect((await get(s.app, "/projects", sid)).statusCode).toBe(200);
    expect((await s.app.inject({ method: "POST", url: "/auth/logout", headers: { authorization: `Bearer ${sid}` } })).statusCode).toBe(204);
    expect((await get(s.app, "/projects", sid)).statusCode).toBe(401);
  });

  it("um novo login que informa a sessão anterior (mesmo navegador) invalida a anterior", async () => {
    const a = await login(s.app, unique("u"));
    const b = await login(s.app, unique("u"), "senha", { authorization: `Bearer ${a.sid}` });
    expect(b.sid).not.toBe(a.sid);
    expect((await get(s.app, "/me", a.sid)).statusCode).toBe(401);
    expect((await get(s.app, "/me", b.sid)).statusCode).toBe(200);
  });

  it("respostas nunca são guardadas em cache", async () => {
    const { sid } = await login(s.app, unique("u"));
    expect((await get(s.app, "/projects", sid)).headers["cache-control"]).toBe("no-store");
  });
});

describe("freio de força bruta (8 falhas por usuário)", () => {
  const tentar = async (user: string, senha: string) => (await login(s.app, user, senha)).res;

  it("bloqueia depois de 8 senhas erradas, mesmo com a senha certa, e informa o tempo de espera", async () => {
    const user = unique("vitima");
    for (let i = 1; i <= 8; i++) expect((await tentar(user, "errada")).statusCode, `tentativa ${i}`).toBe(401);
    const r = await tentar(user, "senha");
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ error: "LIMITE", retryAfterMinutes: expect.any(Number) });
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("o bloqueio vale para o usuário (sem diferenciar maiúsculas), não para os outros", async () => {
    const user = unique("vitima");
    for (let i = 0; i < 8; i++) await tentar(user, "errada");
    expect((await tentar(user.toUpperCase(), "senha")).statusCode).toBe(429);
    expect((await tentar(unique("outro"), "senha")).statusCode).toBe(200);
  });

  it("um login correto zera o contador", async () => {
    const user = unique("zera");
    for (let i = 0; i < 5; i++) await tentar(user, "errada");
    expect((await tentar(user, "senha")).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) expect((await tentar(user, "errada")).statusCode).toBe(401);   // 5 + 5 > 8, mas zerou no meio
    expect((await tentar(user, "senha")).statusCode).toBe(200);
  });

  it("sem TRUST_PROXY, X-Forwarded-For é ignorado (não dá para forjar o IP)", async () => {
    const hdr = (ip: string) => ({ "x-forwarded-for": ip });
    // 8*25 = 200 falhas seriam necessárias para o limite por IP; aqui só garantimos que o cabeçalho não muda o comportamento
    const r1 = await login(s.app, unique("u"), "errada", hdr("1.1.1.1"));
    const r2 = await login(s.app, unique("u"), "errada", hdr("2.2.2.2"));
    expect([r1.res.statusCode, r2.res.statusCode]).toEqual([401, 401]);
  });
});

describe("chave interna (INTERNAL_API_KEY)", () => {
  it("com a chave definida, exige o cabeçalho x-api-key (exceto nas sondas)", async () => {
    const k = await startStack({ apiKey: "chave-secreta-do-front" });
    try {
      expect((await k.app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
      expect((await k.app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(200);
      const body = { username: "ana", password: "senha" };
      expect((await k.app.inject({ method: "POST", url: "/auth/login", payload: body })).json()).toEqual({ error: "API_KEY" });
      expect((await k.app.inject({ method: "POST", url: "/auth/login", payload: body, headers: { "x-api-key": "errada" } })).statusCode).toBe(401);
      expect((await k.app.inject({ method: "POST", url: "/auth/login", payload: body, headers: { "x-api-key": "chave-secreta-do-front" } })).statusCode).toBe(200);
    } finally { await k.stop(); }
  });
});

describe("usuário de serviço", () => {
  it("senha do usuário de serviço recusada: a pessoa entra, mas os dados respondem 503 SERVICE_AUTH", async () => {
    const k = await startStack({ env: { TAIGA_SERVICE_PASSWORD: "errada" } });
    try {
      const { sid, res } = await login(k.app, unique("u"));
      expect(res.statusCode).toBe(200);
      const r = await get(k.app, "/projects", sid);
      expect(r.statusCode).toBe(503);
      expect(r.json()).toEqual({ error: "SERVICE_AUTH" });
    } finally { await k.stop(); }
  });

  it("sem credenciais do serviço: /readyz 503 listando o que falta, e login 503 CONFIG", async () => {
    const k = await startStack({ env: { TAIGA_SERVICE_USER: "", TAIGA_SERVICE_PASSWORD: "" } });
    try {
      const r = await k.app.inject({ method: "GET", url: "/readyz" });
      expect(r.statusCode).toBe(503);
      expect(r.json()).toMatchObject({ missing: ["TAIGA_SERVICE_USER", "TAIGA_SERVICE_PASSWORD"] });
      expect((await login(k.app, "ana")).body.error).toBe("CONFIG");
    } finally { await k.stop(); }
  });
});

describe("expiração de sessão por inatividade", () => {
  it("o uso renova o prazo; parar além do limite encerra a sessão", async () => {
    const k = await startStack({ env: { SESSION_IDLE_MINUTES: "0.04" } });   // 2,4 s
    try {
      const { sid } = await login(k.app, unique("u"));
      for (let i = 0; i < 3; i++) {                                           // 3 usos espaçados de 1,2 s: continua valendo
        await new Promise((r) => setTimeout(r, 1200));
        expect((await get(k.app, "/me", sid)).statusCode).toBe(200);
      }
      await new Promise((r) => setTimeout(r, 2800));
      expect((await get(k.app, "/me", sid)).statusCode).toBe(401);
    } finally { await k.stop(); }
  }, 15_000);
});
