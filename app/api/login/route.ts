import { NextResponse } from "next/server";
import { taigaLogin, TaigaError } from "@/lib/taiga";
import { createSession } from "@/lib/session";
import { clientIp, loginLimiters } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const form = await req.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  // Redirecionamento RELATIVO: o navegador resolve na origem em que já está (localhost, 127.0.0.1, IP, proxy HTTPS).
  // Montar a URL a partir de req.url usava o endereço do servidor e quebrava o login (e o CSP form-action) em outros hosts.
  const back = (q: string) => new NextResponse(null, { status: 303, headers: { Location: q } });
  if (!username || !password) return back("/?erro=1");

  // Freio de força bruta: bloqueia ANTES de consultar o Taiga (por usuário e por IP).
  const userKey = username.toLowerCase();
  const ip = clientIp(req);
  const wait = Math.max(loginLimiters.user.retryAfter(userKey), loginLimiters.ip.retryAfter(ip));
  if (wait > 0) {
    console.warn(`[login] bloqueado por excesso de tentativas (ip=${ip}, libera em ${Math.ceil(wait / 1000)}s)`);
    return back(`/?erro=LIMITE&m=${Math.max(1, Math.ceil(wait / 60_000))}`);
  }

  try {
    const u = await taigaLogin(username, password);
    loginLimiters.user.reset(userKey);
    createSession({
      authToken: u.auth_token, refresh: u.refresh, userId: u.id,
      fullName: u.full_name_display ?? u.full_name ?? u.username,
      username: u.username, photo: u.photo ?? null,
    });
    return back("/projects");
  } catch (e) {
    // só credenciais recusadas contam como tentativa; falha de rede não penaliza ninguém
    if (e instanceof TaigaError && e.message === "CRED") { loginLimiters.user.fail(userKey); loginLimiters.ip.fail(ip); }
    return back(`/?erro=${e instanceof TaigaError ? e.message : "REDE"}`);
  }
}
