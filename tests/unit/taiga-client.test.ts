import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sessão simulada (o cliente lê o token da sessão e pode renová-lo).
const session = { authToken: "token-1", refresh: "refresh-1", userId: 1, fullName: "Ana", username: "ana", photo: null };
vi.mock("@/lib/session", () => ({ getSession: async () => ({ sid: "sid", session }) }));

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

/** Importa o cliente do zero, com as variáveis de ambiente desejadas e um fetch simulado. */
async function load(handler: Handler, env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("TAIGA_URL", "http://taiga.test");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  delete (globalThis as { __taigaSem?: unknown }).__taigaSem;   // o semáforo é global (sobrevive ao HMR): zera entre os testes
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => handler(String(url), init ?? {}));   // async: erro vira promessa rejeitada, como no fetch real
  vi.stubGlobal("fetch", fetchMock);
  const mod = await import("@/lib/taiga");
  return { ...mod, fetchMock };
}

beforeEach(() => { session.authToken = "token-1"; session.refresh = "refresh-1"; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("taigaGet", () => {
  it("envia o token do usuário e pede a lista inteira (sem paginação)", async () => {
    const { taigaGet, fetchMock } = await load(() => json([{ id: 1 }]));
    expect(await taigaGet("/projects")).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://taiga.test/api/v1/projects");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-1", "x-disable-pagination": "True" });
  });

  it("repete em 503 e dá certo na 2ª tentativa", async () => {
    let n = 0;
    const { taigaGet, fetchMock } = await load(() => (++n === 1 ? new Response("", { status: 503 }) : json({ ok: true })));
    expect(await taigaGet("/x")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repete quando a rede falha", async () => {
    let n = 0;
    const { taigaGet, fetchMock } = await load(() => { if (++n === 1) throw new TypeError("fetch failed"); return json({ ok: true }); });
    expect(await taigaGet("/x")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não repete erros definitivos (404): uma tentativa só", async () => {
    const { taigaGet, TaigaError, fetchMock } = await load(() => new Response("", { status: 404 }));
    await expect(taigaGet("/x")).rejects.toMatchObject({ status: 404 });
    await expect(taigaGet("/x")).rejects.toBeInstanceOf(TaigaError);
    expect(fetchMock).toHaveBeenCalledTimes(2);   // 1 por chamada, sem retentativa
  });

  it("desiste depois de 3 tentativas em 503", async () => {
    const { taigaGet, fetchMock } = await load(() => new Response("", { status: 503 }));
    await expect(taigaGet("/x")).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("timeout vira erro 504 e não é repetido", async () => {
    const { taigaGet, fetchMock } = await load(
      (_u, init) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason))) as unknown as Response,
      { TAIGA_TIMEOUT_MS: "80" },
    );
    await expect(taigaGet("/lento")).rejects.toMatchObject({ status: 504 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("renova o token quando o Taiga responde 401 e repete a chamada", async () => {
    const { taigaGet, fetchMock } = await load((url, init) => {
      if (url.endsWith("/auth/refresh")) return json({ auth_token: "token-2", refresh: "refresh-2" });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer token-2" ? json({ ok: true }) : new Response("", { status: 401 });
    });
    expect(await taigaGet("/x")).toEqual({ ok: true });
    expect(session.authToken).toBe("token-2");                       // sessão atualizada
    expect(fetchMock.mock.calls.map((c) => String(c[0]).split("/api/v1")[1])).toEqual(["/x", "/auth/refresh", "/x"]);
  });

  it("se a renovação falhar, devolve 401", async () => {
    const { taigaGet } = await load((url) => (url.endsWith("/auth/refresh") ? new Response("", { status: 400 }) : new Response("", { status: 401 })));
    await expect(taigaGet("/x")).rejects.toMatchObject({ status: 401 });
  });
});

describe("taigaGetPaged", () => {
  it("lê o total do cabeçalho x-pagination-count e NÃO desabilita a paginação", async () => {
    const { taigaGetPaged, fetchMock } = await load(() => json([1, 2], { headers: { "x-pagination-count": "300", "Content-Type": "application/json" } }));
    expect(await taigaGetPaged("/userstories?page=1&page_size=2")).toEqual({ data: [1, 2], count: 300 });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("x-disable-pagination");
  });
  it("sem o cabeçalho, usa o tamanho da lista", async () => {
    const { taigaGetPaged } = await load(() => json([1, 2, 3]));
    expect((await taigaGetPaged("/x")).count).toBe(3);
  });
});

describe("taigaLogin", () => {
  it("credenciais recusadas viram 'CRED'; falha de rede vira 'REDE'", async () => {
    const a = await load(() => new Response("{}", { status: 400 }));
    await expect(a.taigaLogin("u", "p")).rejects.toMatchObject({ message: "CRED" });
    const b = await load(() => { throw new TypeError("fetch failed"); });
    await expect(b.taigaLogin("u", "p")).rejects.toMatchObject({ message: "REDE" });
  });
  it("login com sucesso devolve os dados do usuário (e usa POST em /auth)", async () => {
    const { taigaLogin, fetchMock } = await load(() => json({ id: 7, auth_token: "t", refresh: "r" }));
    expect(await taigaLogin("ana", "senha")).toMatchObject({ id: 7 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://taiga.test/api/v1/auth");
    expect(init.method).toBe("POST");
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
