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

// Armazenamento em memória (v1). Para produção/múltiplas instâncias, troque por Redis.
const g = globalThis as unknown as { __sessions?: Map<string, Session> };
const store = (g.__sessions ??= new Map<string, Session>());

const COOKIE = "tdv_sid";

export function createSession(s: Session) {
  const sid = randomBytes(32).toString("hex");
  store.set(sid, s);
  cookies().set(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function getSession(): { sid: string; session: Session } | null {
  const sid = cookies().get(COOKIE)?.value;
  if (!sid) return null;
  const session = store.get(sid);
  return session ? { sid, session } : null;
}

export function destroySession() {
  const sid = cookies().get(COOKIE)?.value;
  if (sid) store.delete(sid);
  cookies().delete(COOKIE);
}
