import { randomBytes } from "node:crypto";

/** Identidade da pessoa logada. NÃO guarda token do Taiga: as consultas usam o usuário de serviço. */
export type Session = {
  userId: number;
  fullName: string;
  username: string;
  photo: string | null;
};

type Stored = { session: Session; created: number; seen: number };

// Armazenamento em memória. Para várias réplicas, troque por Redis (veja docs/MELHORIAS-PENDENTES.md).
const g = globalThis as unknown as { __sessions?: Map<string, Stored> };
const store = (g.__sessions ??= new Map<string, Stored>());

const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);
const MAX_AGE_MS = num(process.env.SESSION_MAX_HOURS, 12) * 3_600_000;       // duração máxima, a contar do login
const IDLE_MS = num(process.env.SESSION_IDLE_MINUTES, 120) * 60_000;          // expira após esse tempo sem uso
const MAX_SESSIONS = 5000;                                                      // teto de memória

/** Duração máxima da sessão, em segundos (o front usa como validade do cookie). */
export const SESSION_MAX_AGE_S = Math.floor(MAX_AGE_MS / 1000);

const expired = (e: Stored, now: number) => now - e.created > MAX_AGE_MS || now - e.seen > IDLE_MS;

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return; // no máximo 1x por minuto
  lastSweep = now;
  for (const [k, e] of store) if (expired(e, now)) store.delete(k);
}

/** Cria a sessão e devolve o identificador (opaco, 256 bits). `replace` encerra a sessão anterior do mesmo navegador. */
export function createSession(s: Session, replace?: string | null): string {
  const now = Date.now();
  sweep(now);
  if (replace) store.delete(replace);
  while (store.size >= MAX_SESSIONS) store.delete(store.keys().next().value as string); // descarta a mais antiga
  const sid = randomBytes(32).toString("hex");
  store.set(sid, { session: s, created: now, seen: now });
  return sid;
}

export function getSession(sid: string | null | undefined): Session | null {
  if (!sid) return null;
  const now = Date.now();
  sweep(now);
  const e = store.get(sid);
  if (!e) return null;
  if (expired(e, now)) { store.delete(sid); return null; }
  e.seen = now; // janela deslizante: cada uso renova o tempo de inatividade
  return e.session;
}

export function destroySession(sid: string | null | undefined) {
  if (sid) store.delete(sid);
}
