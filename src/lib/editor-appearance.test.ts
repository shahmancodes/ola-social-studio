import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { EditorAppearanceSchema } from "./editor-appearance";
import { applyEditorAppearance } from "./scene-editor-appearance";
import { scenePng, sceneSvg, type VisualScene } from "./content-layout";
import { canvasTexts } from "./canvas-text";
import { SimpleArtifactSchema } from "./simple-content";
import { artifactPages, withArtifactPages } from "./composition";
import type { ContentBrand } from "./content-brand";

const brand: ContentBrand = { companyId: "test", name: "Test", audience: "Readers", voice: "Clear", description: "", typography: "Manrope", imagery: "", formatRules: "", examples: [], palette: { background: "#FFFFFF", alternate: "#EEEEEE", accent: "#123456", ink: "#111111", dark: "#111111" }, assets: [] };

describe("canvas appearance and export", () => {
  it("retains text and crop settings through schema validation and page edits", () => {
    const editorAppearance = { text: { title: { font: "serif", fontSize: 48, color: "#123456", align: "right" } }, image: { crop: { x: .25, y: .25, width: .5, height: .5 }, x: .5, y: .4 } };
    const artifact = SimpleArtifactSchema.parse({ type: "poster", headline: "Original", subline: "Body", editorAppearance });
    const [page] = artifactPages(artifact);
    expect(SimpleArtifactSchema.parse(withArtifactPages(artifact, [{ ...page, title: "Updated" }]))).toMatchObject({ headline: "Updated", editorAppearance });
    expect(EditorAppearanceSchema.safeParse({ image: { crop: { x: .8, y: 0, width: .5, height: 1 } } }).success).toBe(false);
  });

  it("exports the same edited font, alignment, cropped pixels and position as the canvas metadata", async () => {
    const source = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#ff0000" } }).composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: "#0000ff" } }).png().toBuffer(), left: 100, top: 0 }]).png().toBuffer();
    const page = { title: "Keep this clear", body: "", assetId: "image", editorAppearance: EditorAppearanceSchema.parse({ text: { title: { font: "serif", bold: false, italic: true, underline: true, fontSize: 36, color: "#123456", align: "right" } }, image: { crop: { x: .5, y: 0, width: .5, height: 1 }, x: .5, y: .5 } }) };
    const scene: VisualScene = { width: 600, height: 600, background: "#FFFFFF", elements: [
      { kind: "text", id: "title", text: page.title, x: 40, y: 40, w: 500, h: 120, size: 48, weight: "bold", color: "#111111", lines: [page.title] },
      { kind: "image", id: "artwork", bytes: source, x: 40, y: 250, w: 100, h: 100 },
    ] };
    await applyEditorAppearance(scene, page, brand);
    const png = await scenePng(scene);
    expect(canvasTexts(scene, page)[0]).toMatchObject({ id: "title", text: page.title, fontFamily: "Georgia", fontSize: 36, fontWeight:400, italic:true, underline:true, align: "right", color: "#123456" });
    const image = scene.elements.find(e => e.kind === "image")!;
    expect(image).toMatchObject({ x: 300, y: 300, originalWidth: 200, originalHeight: 100 });
    expect([...await sharp(png).extract({ left: 350, top: 350, width: 1, height: 1 }).removeAlpha().raw().toBuffer()]).toEqual([0, 0, 255]);
    expect(sceneSvg(scene)).toContain("<foreignObject");
    expect(sceneSvg(scene)).toContain("text-align:right");
    expect(sceneSvg(scene)).toContain("font-style:italic");
    expect(sceneSvg(scene)).toContain("text-decoration:underline");
    expect(sceneSvg(scene)).toContain("font-weight:400");
  });
});
