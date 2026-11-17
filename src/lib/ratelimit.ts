/**
 * Limitador de FALHAS por janela deslizante (em memória). Usado no login para frear
 * força bruta: sem ele, este app serviria de intermediário para testar senhas no Taiga.
 */
export class FailureLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly maxKeys = 10_000) {}

  private recent(key: string, now: number): number[] {
    const a = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (a.length) this.hits.set(key, a); else this.hits.delete(key);
    return a;
  }

  /** Milissegundos até poder tentar de novo (0 = liberado). */
  retryAfter(key: string, now = Date.now()): number {
    const a = this.recent(key, now);
    return a.length >= this.max ? this.windowMs - (now - a[0]) : 0;
  }

  fail(key: string, now = Date.now()): void {
    const a = this.recent(key, now);
    a.push(now);
    this.hits.set(key, a);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value as string); // teto de memória
  }

  reset(key: string): void { this.hits.delete(key); }
}

const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);
const MAX = num(process.env.LOGIN_MAX_FAILURES, 8);
const WINDOW = num(process.env.LOGIN_WINDOW_MINUTES, 15) * 60_000;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const g = globalThis as unknown as { __loginLimiters?: { user: FailureLimiter; ip: FailureLimiter } };
export const loginLimiters = (g.__loginLimiters ??= {
  user: new FailureLimiter(MAX, WINDOW),
  // Sem proxy confiável todos os clientes compartilham o mesmo "IP": o teto precisa ser bem maior.
  ip: new FailureLimiter(TRUST_PROXY ? MAX * 4 : MAX * 25, WINDOW),
});

/**
 * IP do cliente. Só confia em X-Forwarded-For se TRUST_PROXY=1: aqui o "proxy" é o front (que repassa o IP real
 * recebido do roteador do OpenShift). Sem isso todos os clientes dividem o mesmo "IP".
 */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  if (!TRUST_PROXY) return "direto";
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const xff = one(headers["x-forwarded-for"])?.split(",")[0]?.trim();
  return xff || one(headers["x-real-ip"]) || "desconhecido";
}
