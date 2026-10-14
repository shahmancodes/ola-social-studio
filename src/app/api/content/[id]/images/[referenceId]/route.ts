import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { db } from "@/lib/platform-db";

export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string; referenceId: string }> }) {
  try {
    const { id, referenceId } = await context.params;
    await requireProjectAccess(id);
    const reference = db().prepare("SELECT disk_path FROM project_references WHERE id=? AND project_id=? AND media_type='image/png'").get(referenceId, id) as { disk_path: string } | undefined;
    if (!reference) throw new Error("Not found.");
    return new Response(new Uint8Array(await fs.readFile(reference.disk_path)), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Image not found." }, { status: 404 }); }
}
