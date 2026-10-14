import { NextResponse } from "next/server";
import { acceptInvitation, createSession } from "@/lib/platform-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = acceptInvitation(String(body.token ?? ""), String(body.email ?? ""), String(body.password ?? ""));
    await createSession(userId);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not accept invitation." }, { status: 400 }); }
}
