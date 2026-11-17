import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST() {
  destroySession();
  // Redirecionamento relativo (veja o comentário em api/login/route.ts).
  return new NextResponse(null, { status: 303, headers: { Location: "/" } });
}
