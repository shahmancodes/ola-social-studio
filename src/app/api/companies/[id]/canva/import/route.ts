import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { requireMembership } from "@/lib/platform-auth";
import { canvaRequest } from "@/lib/canva";
import { storeCompanyAsset } from "@/lib/platform";
import { db } from "@/lib/platform-db";

export const runtime = "nodejs";
const Input = z.object({ designId: z.string().min(3).max(100), title: z.string().max(200), pageCount: z.number().int().min(1).max(500).default(1) });
type Job = { job: { id: string; status: "in_progress" | "success" | "failed"; urls?: string[]; error?: { message?: string } } };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireMembership(id, "admin");
    const input = Input.parse(await request.json());
    const marker = `canva:${input.designId}:overview`;
    if (db().prepare("SELECT 1 FROM assets WHERE company_id=? AND source_url=?").get(id, marker)) throw new Error("This design is already in your references.");
    const pageCount = Math.min(input.pageCount, 12);
    let result = await canvaRequest(id, user.id, "exports", { method: "POST", body: JSON.stringify({ design_id: input.designId, format: { type: "png", pages: Array.from({ length: pageCount }, (_, index) => index + 1) } }) }) as Job;
    for (let attempt = 0; result.job.status === "in_progress" && attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await canvaRequest(id, user.id, `exports/${encodeURIComponent(result.job.id)}`) as Job;
    }
    if (result.job.status !== "success" || !result.job.urls?.length) throw new Error(result.job.error?.message ?? "Canva is still preparing this design. Try again shortly.");
    const pageBuffers: Buffer[] = [];
    for (const url of result.job.urls.slice(0, pageCount)) {
      const exportUrl = new URL(url);
      if (exportUrl.protocol !== "https:" || exportUrl.hostname !== "export-download.canva.com") throw new Error("Canva returned an unexpected export address.");
      const download = await fetch(exportUrl, { signal: AbortSignal.timeout(20000), cache: "no-store", redirect: "error" });
      if (!download.ok || Number(download.headers.get("content-length") ?? 0) > 20 * 1024 * 1024) throw new Error("Could not download the Canva design.");
      const bytes = Buffer.from(await download.arrayBuffer());
      if (bytes.length > 20 * 1024 * 1024) throw new Error("This Canva design is too large to import.");
      pageBuffers.push(pageCount === 1 ? bytes : await sharp(bytes, { limitInputPixels: 40_000_000 }).resize({ width: 550, height: 490, fit: "contain", background: "#FFFFFF" }).png().toBuffer());
    }
    const png = pageBuffers.length === 1
      ? await sharp(pageBuffers[0], { limitInputPixels: 40_000_000 }).resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).png().toBuffer()
      : await sharp({ create: { width: Math.min(3, pageBuffers.length) * 560, height: Math.ceil(pageBuffers.length / 3) * 500, channels: 4, background: "#FFFFFF" } })
        .composite(pageBuffers.map((bytes, index) => ({ input: bytes, left: (index % 3) * 560 + 5, top: Math.floor(index / 3) * 500 + 5 })))
        .png().toBuffer();
    const assetId = await storeCompanyAsset(id, `${input.title.trim() || "Canva design"}.png`, png, "image/png", "reference", { sourceUrl: marker, rightsNote: `Selected from Canva by a company admin; ${pageBuffers.length} page${pageBuffers.length === 1 ? "" : "s"} shown as a visual reference.` }, "supporting");
    return NextResponse.json({ assetId }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import Canva design." }, { status: 400 }); }
}
