import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { getBrand, getCompany } from "@/lib/platform";
import { contentBrand } from "@/lib/content-brand";
import { renderLegacyPostStoryPng, SimpleArtifactSchema } from "@/lib/simple-content";
import { buildVisualScene, scenePng } from "@/lib/content-layout";
import { renderSemanticComponentPng } from "@/lib/semantic-component-image";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);
    const row = projectRow(id); if (!row) throw new Error("Project missing.");
    const body = await request.text();
    if (body.length > 120_000) throw new Error("Preview request is too large.");
    const { artifact: raw, index: rawIndex } = JSON.parse(body);
    const artifact = SimpleArtifactSchema.parse(raw);
    if (artifact.type !== row.content_type || artifact.type === "article") throw new Error("This format has no image preview.");
    if ((artifact.type === "post" || artifact.type === "story") && artifact.designVersion !== 2) return new Response(new Uint8Array(await renderLegacyPostStoryPng(artifact, id)), { headers: { "content-type": "image/png", "cache-control": "private, no-store" } });
    const index = Math.max(0, Number(rawIndex) || 0);
    const snapshot = JSON.parse(row.brand_snapshot_json) as ReturnType<typeof getBrand>;
    const brand = contentBrand(row.company_id, getCompany(row.company_id)?.name ?? "Company", snapshot, row.brief);
    const page = artifact.type === "post" || artifact.type === "story"
      ? { title: artifact.headline, body: artifact.subline, cta: artifact.type === "story" ? artifact.cta : undefined, layout: artifact.layout, eyebrow: artifact.eyebrow, assetId: artifact.assetId, semanticComponent: artifact.semanticComponent, visualOverrides: artifact.visualOverrides }
      : artifact.slides[index];
    if (!page) throw new Error("Slide missing.");
    const format = artifact.type;
    const component = page.semanticComponent ? await renderSemanticComponentPng(page.semanticComponent, brand.palette.accent, brand.companyId) : undefined;
    const scene = await buildVisualScene(format, page, brand, index, artifact.type === "post" || artifact.type === "story" ? 1 : artifact.slides.length, component);
    return new Response(new Uint8Array(await scenePng(scene)), { headers: { "content-type": "image/png", "cache-control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Preview unavailable." }, { status: 400 }); }
}
