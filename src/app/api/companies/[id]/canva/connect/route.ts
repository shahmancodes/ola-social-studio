import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { beginCanvaConnect } from "@/lib/canva";

export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireMembership(id, "admin");
    return NextResponse.redirect(beginCanvaConnect(id, user.id));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not connect Canva." }, { status: 400 }); }
}
