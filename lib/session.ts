import { cookies } from "next/headers";
import { randomBytes } from "crypto";

export type Session = {
  authToken: string;
  refresh: string;
  userId: number;
  fullName: string;
  username: string;
  photo: string | null;
};

type Stored = { session: Session; created: number; seen: number };

// Armazenamento em memória. Para várias instâncias, troque por Redis (veja docs/MELHORIAS-PENDENTES.md).
const g = globalThis as unknown as { __sessions?: Map<string, Stored> };
const store = (g.__sessions ??= new Map<string, Stored>());

const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);
const MAX_AGE_MS = num(process.env.SESSION_MAX_HOURS, 12) * 3_600_000;       // duração máxima, a contar do login
const IDLE_MS = num(process.env.SESSION_IDLE_MINUTES, 120) * 60_000;          // expira após esse tempo sem uso
const MAX_SESSIONS = 5000;                                                      // teto de memória

// Em produção (HTTPS) o prefixo __Host- obriga Secure + Path=/ e impede o cookie de ser sobrescrito por subdomínios.
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-tdv_sid" : "tdv_sid";

const expired = (e: Stored, now: number) => now - e.created > MAX_AGE_MS || now - e.seen > IDLE_MS;

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return; // no máximo 1x por minuto
  lastSweep = now;
  for (const [k, e] of store) if (expired(e, now)) store.delete(k);
}

export async function createSession(s: Session) {
  const jar = await cookies(); // Next 15+: cookies() é assíncrono
  const now = Date.now();
  sweep(now);
  const old = jar.get(COOKIE)?.value;
  if (old) store.delete(old); // um novo login encerra a sessão anterior deste navegador
  while (store.size >= MAX_SESSIONS) store.delete(store.keys().next().value as string); // descarta a mais antiga

  const sid = randomBytes(32).toString("hex");
  store.set(sid, { session: s, created: now, seen: now });
  jar.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(MAX_AGE_MS / 1000),
  });
}

export async function getSession(): Promise<{ sid: string; session: Session } | null> {
  const sid = (await cookies()).get(COOKIE)?.value;
  if (!sid) return null;
  const now = Date.now();
  sweep(now);
  const e = store.get(sid);
  if (!e) return null;
  if (expired(e, now)) { store.delete(sid); return null; }
  e.seen = now; // janela deslizante: cada uso renova o tempo de inatividade
  return { sid, session: e.session };
}

export async function destroySession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) store.delete(sid);
  jar.delete(COOKIE);
}
