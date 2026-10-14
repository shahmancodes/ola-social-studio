import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { deleteCompanyAsset, getCompanyAsset } from "@/lib/platform";
export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  try { const { id, assetId } = await context.params; await requireMembership(id); const asset = getCompanyAsset(id, assetId); if (!asset) throw new Error("Asset not found."); const bytes = await fs.readFile(asset.disk_path); return new Response(new Uint8Array(bytes), { headers: { "content-type": asset.media_type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" } }); }
  catch { return NextResponse.json({ error: "Asset not found." }, { status: 404 }); }
}
export async function DELETE(_: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await context.params;
    await requireMembership(id, "admin");
    if (!getCompanyAsset(id, assetId)) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await deleteCompanyAsset(id, assetId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete asset." }, { status: 403 });
  }
}
