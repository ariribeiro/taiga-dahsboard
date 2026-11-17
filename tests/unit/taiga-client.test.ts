import { afterEach, describe, expect, it, vi } from "vitest";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

/**
 * Importa o cliente do zero, com as variáveis de ambiente desejadas e um fetch simulado.
 * O login do usuário de serviço (POST /auth com TAIGA_SERVICE_USER) é respondido aqui e entregue em `tokenFor`;
 * `handler` só vê as demais chamadas.
 */
async function load(handler: Handler, env: Record<string, string> = {}, tokenFor: () => { auth_token: string; refresh: string } = () => ({ auth_token: "token-1", refresh: "refresh-1" })) {
  vi.resetModules();
  vi.stubEnv("TAIGA_URL", "http://taiga.test");
  vi.stubEnv("TAIGA_SERVICE_USER", "svc-dashboard");
  vi.stubEnv("TAIGA_SERVICE_PASSWORD", "segredo");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  delete (globalThis as { __taigaSem?: unknown }).__taigaSem;   // o semáforo é global (sobrevive ao HMR): zera entre os testes
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url), i = init ?? {};
    if (u.endsWith("/api/v1/auth") && JSON.parse(String(i.body)).username === "svc-dashboard") return json(tokenFor());
    return handler(u, i);   // async: erro vira promessa rejeitada, como no fetch real
  });
  vi.stubGlobal("fetch", fetchMock);
  const mod = await import("@/lib/taiga");
  /** Chamadas ao Taiga, sem o login do usuário de serviço. */
  const calls = () => fetchMock.mock.calls.map((c) => String(c[0]).split("/api/v1")[1]);
  return { ...mod, fetchMock, calls };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("taigaGet (usuário de serviço)", () => {
  it("entra com o usuário de serviço, envia o token dele e pede a lista inteira (sem paginação)", async () => {
    const { taigaGet, fetchMock } = await load(() => json([{ id: 1 }]));
    expect(await taigaGet("/projects")).toEqual([{ id: 1 }]);
    const [loginUrl, loginInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(loginUrl).toBe("http://taiga.test/api/v1/auth");
    expect(JSON.parse(String(loginInit.body))).toMatchObject({ type: "normal", username: "svc-dashboard", password: "segredo" });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://taiga.test/api/v1/projects");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-1", "x-disable-pagination": "True" });
  });

  it("faz o login uma única vez, mesmo com chamadas simultâneas e seguintes", async () => {
    const { taigaGet, fetchMock } = await load(() => json({ ok: true }));
    await Promise.all([taigaGet("/a"), taigaGet("/b"), taigaGet("/c")]);
    await taigaGet("/d");
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/auth"))).toHaveLength(1);
  });

  it("repete em 503 e dá certo na 2ª tentativa", async () => {
    let n = 0;
    const { taigaGet, calls } = await load(() => (++n === 1 ? new Response("", { status: 503 }) : json({ ok: true })));
    expect(await taigaGet("/x")).toEqual({ ok: true });
    expect(calls()).toEqual(["/auth", "/x", "/x"]);
  });

  it("repete quando a rede falha", async () => {
    let n = 0;
    const { taigaGet, calls } = await load(() => { if (++n === 1) throw new TypeError("fetch failed"); return json({ ok: true }); });
    expect(await taigaGet("/x")).toEqual({ ok: true });
    expect(calls()).toEqual(["/auth", "/x", "/x"]);
  });

  it("não repete erros definitivos (404): uma tentativa só", async () => {
    const { taigaGet, TaigaError, calls } = await load(() => new Response("", { status: 404 }));
    await expect(taigaGet("/x")).rejects.toMatchObject({ status: 404 });
    await expect(taigaGet("/x")).rejects.toBeInstanceOf(TaigaError);
    expect(calls()).toEqual(["/auth", "/x", "/x"]);   // 1 login + 1 por chamada, sem retentativa
  });

  it("desiste depois de 3 tentativas em 503", async () => {
    const { taigaGet, calls } = await load(() => new Response("", { status: 503 }));
    await expect(taigaGet("/x")).rejects.toMatchObject({ status: 503 });
    expect(calls().filter((c) => c === "/x")).toHaveLength(3);
  }, 10_000);

  it("timeout vira erro 504 e não é repetido", async () => {
    const { taigaGet, calls } = await load(
      (_u, init) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason))) as unknown as Response,
      { TAIGA_TIMEOUT_MS: "80" },
    );
    await expect(taigaGet("/lento")).rejects.toMatchObject({ status: 504 });
    expect(calls().filter((c) => c === "/lento")).toHaveLength(1);
  });

  it("limita as requisições simultâneas (TAIGA_MAX_CONCURRENCY)", async () => {
    let active = 0, peak = 0;
    const { taigaGet } = await load(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return json({ ok: true });
    }, { TAIGA_MAX_CONCURRENCY: "3" });
    await Promise.all(Array.from({ length: 12 }, (_, i) => taigaGet(`/x/${i}`)));
    expect(peak).toBe(3);
  });

  it("renova o token (refresh) quando o Taiga responde 401 e repete a chamada", async () => {
    const { taigaGet, calls } = await load((url, init) => {
      if (url.endsWith("/auth/refresh")) return json({ auth_token: "token-2", refresh: "refresh-2" });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer token-2" ? json({ ok: true }) : new Response("", { status: 401 });
    });
    expect(await taigaGet("/x")).toEqual({ ok: true });
    expect(calls()).toEqual(["/auth", "/x", "/auth/refresh", "/x"]);
  });

  it("várias chamadas simultâneas com token vencido compartilham uma única renovação", async () => {
    const { taigaGet, calls } = await load(async (url, init) => {
      if (url.endsWith("/auth/refresh")) { await new Promise((r) => setTimeout(r, 20)); return json({ auth_token: "token-2", refresh: "refresh-2" }); }
      return (init.headers as Record<string, string>).Authorization === "Bearer token-2" ? json({ ok: true }) : new Response("", { status: 401 });
    });
    await Promise.all([taigaGet("/a"), taigaGet("/b"), taigaGet("/c")]);
    expect(calls().filter((c) => c === "/auth/refresh")).toHaveLength(1);
  });

  it("se o refresh falhar, faz login de novo com o usuário de serviço", async () => {
    let logins = 0;
    const { taigaGet, calls } = await load((url, init) => {
      if (url.endsWith("/auth/refresh")) return new Response("", { status: 400 });
      return (init.headers as Record<string, string>).Authorization === "Bearer novo" ? json({ ok: true }) : new Response("", { status: 401 });
    }, {}, () => (++logins === 1 ? { auth_token: "velho", refresh: "r" } : { auth_token: "novo", refresh: "r2" }));
    expect(await taigaGet("/x")).toEqual({ ok: true });
    expect(calls()).toEqual(["/auth", "/x", "/auth/refresh", "/auth", "/x"]);
  });

  it("401 persistente é problema do usuário de serviço: vira 503 SERVICE_AUTH (nunca 401 para a pessoa)", async () => {
    const { taigaGet } = await load((url) => (url.endsWith("/auth/refresh") ? new Response("", { status: 400 }) : new Response("", { status: 401 })));
    await expect(taigaGet("/x")).rejects.toMatchObject({ status: 503, message: "SERVICE_AUTH" });
  });

  it("senha do usuário de serviço recusada: SERVICE_AUTH", async () => {
    vi.resetModules();
    vi.stubEnv("TAIGA_URL", "http://taiga.test"); vi.stubEnv("TAIGA_SERVICE_USER", "svc"); vi.stubEnv("TAIGA_SERVICE_PASSWORD", "errada");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const { taigaGet } = await import("@/lib/taiga");
    await expect(taigaGet("/x")).rejects.toMatchObject({ status: 503, message: "SERVICE_AUTH" });
  });

  it("sem credenciais do usuário de serviço configuradas, avisa 'CONFIG' e lista o que falta", async () => {
    vi.resetModules();
    vi.stubEnv("TAIGA_URL", "http://taiga.test"); vi.stubEnv("TAIGA_SERVICE_USER", ""); vi.stubEnv("TAIGA_SERVICE_PASSWORD", "");
    const { taigaGet, missingConfig } = await import("@/lib/taiga");
    expect(missingConfig()).toEqual(["TAIGA_SERVICE_USER", "TAIGA_SERVICE_PASSWORD"]);
    await expect(taigaGet("/x")).rejects.toMatchObject({ message: "CONFIG" });
  });
});

describe("taigaGetPaged", () => {
  it("lê o total do cabeçalho x-pagination-count e NÃO desabilita a paginação", async () => {
    const { taigaGetPaged, fetchMock } = await load(() => json([1, 2], { headers: { "x-pagination-count": "300", "Content-Type": "application/json" } }));
    expect(await taigaGetPaged("/userstories?page=1&page_size=2")).toEqual({ data: [1, 2], count: 300 });
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).not.toHaveProperty("x-disable-pagination");
  });
  it("sem o cabeçalho, usa o tamanho da lista", async () => {
    const { taigaGetPaged } = await load(() => json([1, 2, 3]));
    expect((await taigaGetPaged("/x")).count).toBe(3);
  });
});

describe("taigaLogin (pessoa)", () => {
  it("credenciais recusadas viram 'CRED'; falha de rede vira 'REDE'", async () => {
    const a = await load(() => new Response("{}", { status: 400 }));
    await expect(a.taigaLogin("u", "p")).rejects.toMatchObject({ message: "CRED" });
    const b = await load(() => { throw new TypeError("fetch failed"); });
    await expect(b.taigaLogin("u", "p")).rejects.toMatchObject({ message: "REDE" });
  });
  it("devolve só o perfil: o token da pessoa é descartado", async () => {
    const { taigaLogin, fetchMock } = await load(() => json({ id: 7, username: "ana", auth_token: "t", refresh: "r" }));
    const u = await taigaLogin("ana", "senha");
    expect(u).toMatchObject({ id: 7, username: "ana" });
    expect(u).not.toHaveProperty("auth_token");
    expect(u).not.toHaveProperty("refresh");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://taiga.test/api/v1/auth");
    expect(init.method).toBe("POST");
  });
  it("o login de uma pessoa não vira o token usado nas consultas", async () => {
    const { taigaLogin, taigaGet, fetchMock } = await load(() => json({ id: 7, username: "ana", auth_token: "token-da-ana", refresh: "r" }));
    await taigaLogin("ana", "senha");
    await taigaGet("/projects");
    const auths = fetchMock.mock.calls.map((c) => (c[1] as RequestInit).headers as Record<string, string> | undefined).map((h) => h?.Authorization).filter(Boolean);
    expect(auths).toEqual(["Bearer token-1"]);
  });
  it("TAIGA_URL com o valor de exemplo do .env.example também avisa 'CONFIG'", async () => {
    vi.resetModules(); vi.stubEnv("TAIGA_URL", "https://taiga-api.suaempresa.com");
    const { taigaLogin } = await import("@/lib/taiga");
    await expect(taigaLogin("u", "p")).rejects.toMatchObject({ message: "CONFIG" });
  });
  it("sem TAIGA_URL configurada, avisa 'CONFIG'", async () => {
    vi.resetModules(); vi.stubEnv("TAIGA_URL", "");
    const { taigaLogin } = await import("@/lib/taiga");
    await expect(taigaLogin("u", "p")).rejects.toMatchObject({ message: "CONFIG" });
  });
});
