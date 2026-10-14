import { NextResponse } from "next/server";
import { createInvitation, requireMembership } from "@/lib/platform-auth";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireMembership(id, "admin");
    const body = await request.json();
    const role = body.role === "admin" ? "admin" : "member";
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    const token = createInvitation(id, email, role);
    return NextResponse.json({ url: `${new URL(request.url).origin}/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}` });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not invite teammate." }, { status: 400 }); }
}
