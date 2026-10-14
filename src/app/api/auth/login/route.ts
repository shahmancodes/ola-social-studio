import { NextResponse } from "next/server";
import { createSession, passwordMatches } from "@/lib/platform-auth";
import { db } from "@/lib/platform-db";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").toLowerCase().trim();
  const user = db().prepare("SELECT id,password_hash FROM users WHERE email=?").get(email) as { id: string; password_hash: string } | undefined;
  if (!user || !passwordMatches(String(body.password ?? ""), user.password_hash)) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
