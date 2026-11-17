import { afterEach, describe, expect, it, vi } from "vitest";
import { FailureLimiter } from "@/infra/ratelimit";

const MIN = 60_000;

describe("FailureLimiter", () => {
  it("libera até o limite e bloqueia a partir dele", () => {
    const l = new FailureLimiter(3, 15 * MIN);
    for (let i = 0; i < 3; i++) { expect(l.retryAfter("u", 1000)).toBe(0); l.fail("u", 1000); }
    expect(l.retryAfter("u", 1000)).toBeGreaterThan(0);
  });
  it("a janela é deslizante: libera quando a falha mais antiga expira", () => {
    const l = new FailureLimiter(2, 10 * MIN);
    l.fail("u", 0); l.fail("u", 5 * MIN);
    expect(l.retryAfter("u", 6 * MIN)).toBe(4 * MIN);          // a 1ª falha expira em 10 min
    expect(l.retryAfter("u", 10 * MIN + 1)).toBe(0);
  });
  it("chaves independentes", () => {
    const l = new FailureLimiter(1, MIN);
    l.fail("a", 0);
    expect(l.retryAfter("a", 1)).toBeGreaterThan(0);
    expect(l.retryAfter("b", 1)).toBe(0);
  });
  it("reset zera o contador", () => {
    const l = new FailureLimiter(1, MIN);
    l.fail("a", 0); l.reset("a");
    expect(l.retryAfter("a", 1)).toBe(0);
  });
  it("tem teto de memória: descarta a chave mais antiga", () => {
    const l = new FailureLimiter(1, MIN, 2);
    l.fail("k1", 0); l.fail("k2", 0); l.fail("k3", 0);
    expect(l.retryAfter("k1", 1)).toBe(0);                      // descartada
    expect(l.retryAfter("k3", 1)).toBeGreaterThan(0);
  });
});

describe("clientIp", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const req = (h: Record<string, string>) => h;

  it("sem TRUST_PROXY ignora X-Forwarded-For (não dá para forjar o IP)", async () => {
    vi.resetModules();
    const { clientIp } = await import("@/infra/ratelimit");
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("direto");
  });
  it("com TRUST_PROXY=1 usa o primeiro IP do X-Forwarded-For", async () => {
    vi.stubEnv("TRUST_PROXY", "1"); vi.resetModules();
    const { clientIp } = await import("@/infra/ratelimit");
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(req({}))).toBe("desconhecido");
  });
});
