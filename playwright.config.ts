import { defineConfig } from "@playwright/test";

// No CI o Playwright usa o Chromium que ele mesmo instala; localmente dá para apontar outro com PW_CHROMIUM_PATH.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

// Taiga simulado (scripts/mock-taiga.mjs): uma instância "normal" e uma para os testes de falha.
const mock = (port: number, env: Record<string, string> = {}) => ({
  command: "node scripts/mock-taiga.mjs",
  url: `http://localhost:${port}/__stats`,
  reuseExistingServer: !process.env.CI,
  env: { MOCK_PORT: String(port), ...env },
});

// O app em modo produção (precisa de `npm run build` antes). Sobe uma instância por configuração a testar.
const app = (port: number, taigaPort: number, env: Record<string, string> = {}) => ({
  command: `npx next start -p ${port}`,
  url: `http://localhost:${port}`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
  env: { TAIGA_URL: `http://localhost:${taigaPort}`, TAIGA_WEB_URL: "https://taiga.exemplo.com", ...env },
});

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,               // os testes compartilham servidores (limite de login, sessões, contadores do simulador)
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { launchOptions: { executablePath } },
  webServer: [
    mock(9000),
    mock(9001, { MOCK_DONE: "800" }),                                                  // muitos finalizados + modos de falha
    app(3100, 9000),                                                                   // configuração padrão
    app(3101, 9000, { SESSION_IDLE_MINUTES: "0.05" }),                                 // sessão curta (3 s), para testar expiração
    app(3102, 9001, { TAIGA_TIMEOUT_MS: "1500", TAIGA_MAX_CONCURRENCY: "3" }),         // timeout e concorrência baixos
  ],
  projects: [
    { name: "app", testMatch: /(auth|ratelimit|security|ui)\.spec\.ts/, use: { baseURL: "http://localhost:3100" } },
    { name: "sessao", testMatch: /sessao\.spec\.ts/, use: { baseURL: "http://localhost:3101" } },
    { name: "falhas", testMatch: /falhas\.spec\.ts/, use: { baseURL: "http://localhost:3102" } },
  ],
});
