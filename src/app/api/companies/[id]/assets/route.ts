import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireMembership } from "@/lib/platform-auth";
import { db } from "@/lib/platform-db";
import { storeCompanyAsset } from "@/lib/platform";
export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireMembership(id); return NextResponse.json({ assets: db().prepare("SELECT id,name,media_type,category,usage_role,source_url,rights_note,created_at FROM assets WHERE company_id=? ORDER BY created_at DESC").all(id) }); }
  catch { return NextResponse.json({ error: "Access denied." }, { status: 403 }); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireMembership(id, "admin");
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024) throw new Error("Choose a file no larger than 20 MB.");
    const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "font/woff", "font/woff2", "font/ttf", "font/otf", "application/pdf", "application/octet-stream"]);
    if (!allowed.has(file.type)) throw new Error("Unsupported asset type.");
    const category = String(form.get("category") ?? "artwork");
    const usageRole = String(form.get("usageRole") ?? "primary");
    if (!["logo", "wordmark", "font", "illustration", "photography", "icon", "template", "reference"].includes(category)) throw new Error("Invalid asset category.");
    if (!["primary", "supporting"].includes(usageRole)) throw new Error("Invalid asset use.");
    if (category === "font" && !/\.(woff2?|ttf|otf)$/i.test(file.name)) throw new Error("Choose a font file.");
    if (file.type === "application/octet-stream" && category !== "font") throw new Error("Unsupported asset type.");
    const source = Buffer.from(await file.arrayBuffer());
    const image = file.type.startsWith("image/");
    if (["logo", "wordmark"].includes(category) && !image) throw new Error("Choose an image for the logo or wordmark.");
    const bytes = image ? await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).png().toBuffer() : source;
    const assetId = await storeCompanyAsset(id, image ? `${file.name.replace(/\.[^.]+$/, "")}.png` : file.name, bytes, image ? "image/png" : file.type, category, undefined, usageRole as "primary" | "supporting");
    return NextResponse.json({ assetId }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 }); }
}
