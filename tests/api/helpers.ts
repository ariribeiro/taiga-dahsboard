import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { vi } from "vitest";
import type { FastifyInstance } from "fastify";

const freePort = () => new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
  s.on("error", reject);
});

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`mock do Taiga não subiu: ${url}`);
}

export type Stack = { app: FastifyInstance; mock: string; stop: () => Promise<void> };

/**
 * Sobe o Taiga simulado (scripts/mock-taiga.mjs) e a API (em memória, via app.inject), com as variáveis pedidas.
 * O simulador aceita qualquer usuário com a senha "senha"; a pessoa logada é sempre a Ana (id 1).
 */
export async function startStack(o: { env?: Record<string, string>; mockEnv?: Record<string, string>; apiKey?: string } = {}): Promise<Stack> {
  const port = await freePort();
  const proc: ChildProcess = spawn(process.execPath, ["scripts/mock-taiga.mjs"], { env: { ...process.env, MOCK_PORT: String(port), ...o.mockEnv }, stdio: "ignore" });
  const mock = `http://localhost:${port}`;
  await waitFor(`${mock}/__stats`);

  vi.resetModules();
  vi.stubEnv("TAIGA_URL", mock);
  vi.stubEnv("TAIGA_WEB_URL", "https://taiga.exemplo.com");
  vi.stubEnv("TAIGA_SERVICE_USER", "svc-dashboard");
  vi.stubEnv("TAIGA_SERVICE_PASSWORD", "senha");
  vi.stubEnv("NODE_ENV", "test");
  for (const [k, v] of Object.entries(o.env ?? {})) vi.stubEnv(k, v);
  // estado global (sobrevive a resetModules): zera para cada pilha começar limpa
  for (const k of ["__taigaSem", "__sessions", "__loginLimiters", "__projCache", "__kanbanDone"]) delete (globalThis as Record<string, unknown>)[k];

  const { buildApp } = await import("@/app");
  const app = buildApp({ apiKey: o.apiKey ?? "", logger: false });
  await app.ready();
  return { app, mock, stop: async () => { await app.close(); proc.kill(); vi.unstubAllEnvs(); } };
}

export const unique = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export async function login(app: FastifyInstance, username: string, password = "senha", headers: Record<string, string> = {}) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { username, password }, headers });
  const body = res.json() as { sid?: string; error?: string; [k: string]: unknown };
  return { res, body, sid: body.sid ?? "" };
}

export const get = (app: FastifyInstance, url: string, sid?: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url, headers: { ...(sid ? { authorization: `Bearer ${sid}` } : {}), ...headers } });

export const setMode = (mock: string, mode: Record<string, unknown>) =>
  fetch(`${mock}/__mode`, { method: "POST", body: JSON.stringify(mode) });
