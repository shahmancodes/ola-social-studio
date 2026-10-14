import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireProjectAccess } from "@/lib/platform-auth";
import { storeProjectReference } from "@/lib/platform";
import { db } from "@/lib/platform-db";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 10_000_000) throw new Error("Choose an image under 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000) throw new Error("Image dimensions must be at most 6,000 × 6,000.");
    const png = await image.png().toBuffer();
    const referenceId = await storeProjectReference(id, file.name.replace(/[^a-zA-Z0-9._-]/g, "-") + ".png", png, "image/png");
    return NextResponse.json({ referenceId, width: metadata.width, height: metadata.height });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload image." }, { status: 400 }); }
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);
    const references = db().prepare("SELECT id,name FROM project_references WHERE project_id=? AND media_type='image/png' ORDER BY created_at DESC").all(id);
    return NextResponse.json({ images: references });
  } catch { return NextResponse.json({ error: "Project not found." }, { status: 404 }); }
}
