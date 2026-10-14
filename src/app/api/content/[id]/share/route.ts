import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { newShareToken } from "@/lib/platform";
import { db, hashToken, projectRow, now } from "@/lib/platform-db";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); if (projectRow(id)?.status !== "complete") throw new Error("Project is not complete."); const token = newShareToken(id); return NextResponse.json({ url: `${new URL(request.url).origin}/share/${token}`, expiresInDays: 3 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create link." }, { status: 400 }); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); const { token } = await request.json(); db().prepare("UPDATE share_links SET revoked_at=? WHERE project_id=? AND token_hash=?").run(now(), id, hashToken(String(token))); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Could not revoke link." }, { status: 400 }); }
}
