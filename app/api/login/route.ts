import { NextResponse } from "next/server";
import { taigaLogin, TaigaError } from "@/lib/taiga";
import { createSession } from "@/lib/session";

export async function POST(req: Request) {
  const form = await req.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const back = (q: string) => NextResponse.redirect(new URL(q, req.url), 303);
  if (!username || !password) return back("/?erro=1");
  try {
    const u = await taigaLogin(username, password);
    createSession({
      authToken: u.auth_token, refresh: u.refresh, userId: u.id,
      fullName: u.full_name_display ?? u.full_name ?? u.username,
      username: u.username, photo: u.photo ?? null,
    });
    return back("/projects");
  } catch (e) {
    return back(`/?erro=${e instanceof TaigaError ? e.message : "REDE"}`);
  }
}
