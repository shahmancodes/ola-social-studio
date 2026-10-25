import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { getBrand, getCompany } from "@/lib/platform";
import { contentBrand } from "@/lib/content-brand";
import { renderLegacyPostStoryPng, SimpleArtifactSchema } from "@/lib/simple-content";
import { buildVisualScene, scenePng, sceneSvg } from "@/lib/content-layout";
import { canvasTexts } from "@/lib/canvas-text";
import { previewSceneObjects } from "@/lib/freeform-scene";
import { sceneFontCss } from "@/lib/scene-renderer";
import { sceneTargets } from "@/lib/composition-scene";
import { renderSemanticComponentPng } from "@/lib/semantic-component-image";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);
    const row = projectRow(id); if (!row) throw new Error("Project missing.");
    const body = await request.text();
    if (body.length > 1_000_000) throw new Error("Preview request is too large.");
    const { artifact: raw, index: rawIndex, editor } = JSON.parse(body);
    const artifact = SimpleArtifactSchema.parse(raw);
    if (artifact.type !== row.content_type || artifact.type === "article") throw new Error("This format has no image preview.");
    if ((artifact.type === "post" || artifact.type === "story") && artifact.designVersion !== 2) return new Response(new Uint8Array(await renderLegacyPostStoryPng(artifact, id)), { headers: { "content-type": "image/png", "cache-control": "private, no-store" } });
    const index = Math.max(0, Number(rawIndex) || 0);
    const snapshot = JSON.parse(row.brand_snapshot_json) as ReturnType<typeof getBrand>;
    const brand = contentBrand(row.company_id, getCompany(row.company_id)?.name ?? "Company", snapshot, row.brief,id);
    const page = artifact.type === "post" || artifact.type === "story" || artifact.type === "poster"
      ? { editorAppearance: artifact.editorAppearance, composition: artifact.composition, credit: artifact.credit, visualContent: artifact.visualContent, storyTreatment: artifact.type === "story" ? artifact.storyTreatment : undefined, title: artifact.headline, body: artifact.subline, cta: (artifact.type === "story" || artifact.type === "poster") ? artifact.cta : undefined, layout: artifact.layout, eyebrow: artifact.eyebrow, assetId: artifact.assetId, supportingAssetIds: artifact.supportingAssetIds, semanticComponent: artifact.semanticComponent, visualOverrides: artifact.visualOverrides }
      : artifact.slides[index];
    if (!page) throw new Error("Slide missing.");
    const format = artifact.type;
    const component = page.semanticComponent && !page.composition ? await renderSemanticComponentPng(page.semanticComponent, brand.palette.accent, brand.companyId) : undefined;
    const scene = await buildVisualScene(format, page, brand, index, artifact.type === "post" || artifact.type === "story" || artifact.type === "poster" ? 1 : artifact.slides.length, component);
    const bytes = await scenePng(scene);
    if (editor === true) {
      // scenePng measures the real fonts first; the editor receives the same geometry.
      const texts = canvasTexts(scene, page);
      const editable = new Set(texts.map(text => text.elementIndex));
      const fontCss = scene.measured ? await sceneFontCss(scene) : "";
      const background = sceneSvg({ ...scene, elements: scene.elements.filter((_, index) => !editable.has(index) && scene.elements[index].id !== "artwork") });
      const svg = background.replace(/(<svg[^>]*>)/, `$1<style>${fontCss}</style>`);
      const artwork = scene.elements.find(element => element.kind === "image" && element.id === "artwork");
      const group = scene.responsiveLayout?.evidence?.groups.find(g=>g.id==='artwork');
      return NextResponse.json({ brandName: brand.name, palette: brand.palette, objects: previewSceneObjects(scene, page), width: scene.width, height: scene.height, color: scene.background, appearance: page.editorAppearance, divider: scene.responsiveLayout ? { x: scene.responsiveLayout.frame.x, y: scene.responsiveLayout.frame.y, width: scene.responsiveLayout.frame.w, height: scene.responsiveLayout.frame.h } : { x: scene.width * .07, y: scene.height * .2, width: scene.width * .86, height: scene.height * .6 }, background: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, fontCss, balanced: scene.compositionVersion === 1, texts, visualGroup: group ? {x:group.x,y:group.y,width:group.w,height:group.h} : undefined, artwork: artwork?.kind === "image" ? { x: artwork.x, y: artwork.y, width: artwork.w, height: artwork.h, assetId: page.assetId && (!page.semanticComponent || scene.responsiveLayout) ? page.assetId : undefined, url: `data:image/png;base64,${artwork.bytes.toString("base64")}`, sourceAspect: (artwork.originalWidth ?? artwork.bytes.readUInt32BE(16)) / (artwork.originalHeight ?? artwork.bytes.readUInt32BE(20)) } : undefined }, { headers: { "cache-control": "private, no-store" } });
    }
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png", "cache-control": "private, no-store", ...(page.composition ? { "x-ola-scene": encodeURIComponent(JSON.stringify(sceneTargets(scene))) } : {}) } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Preview unavailable." }, { status: 400 }); }
}
