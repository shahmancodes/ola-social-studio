import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConceptSchema, GeneratedConceptSchema, GeneratedInternetAssetDossierSchema, normalizeGeneratedStoryboard, ProjectSchema, StoryboardSchema, ToneSchema, VercelInternetAssetDossierSchema, VercelVisualReferenceDossierSchema, VisualReferenceDossierSchema } from "./schemas";

describe("carousel schemas", () => {
  it("defaults older projects to the guide format", () => {
    const parsed = ProjectSchema.parse({
      id: "legacy",
      title: "Legacy",
      brief: "A valid legacy brief",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(parsed.contentFormat).toBe("guide");
    expect(parsed.tone).toBe("playful");
    expect(parsed.visualFormat).toBe("auto");
    expect(parsed.slideCount).toBeNull();
    expect(parsed.additionalInstructions).toBe("");
    expect(parsed.sourceRiskAccepted).toBe(false);
    expect(parsed.visualReferences).toBeUndefined();
    expect(parsed.internetAssets).toBeUndefined();
  });

  it("accepts supported tones and rejects an unknown tone", () => {
    expect(ToneSchema.parse("calm")).toBe("calm");
    expect(ToneSchema.parse("dry-humour")).toBe("dry-humour");
    expect(ToneSchema.safeParse("corporate").success).toBe(false);
  });

  it("accepts Auto or a supported carousel-level visual format", () => {
    const base = {
      id: "visual-format",
      title: "Visual format",
      brief: "A valid visual format brief",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(ProjectSchema.parse({ ...base, visualFormat: "auto" }).visualFormat).toBe("auto");
    expect(ProjectSchema.parse({ ...base, visualFormat: "text-led" }).visualFormat).toBe("text-led");
    expect(ProjectSchema.safeParse({ ...base, visualFormat: "random-layout" }).success).toBe(false);
  });

  it("requires every concept field in strict provider JSON Schema", () => {
    const schema = z.toJSONSchema(GeneratedConceptSchema) as { properties?: Record<string, unknown>; required?: string[] };
    expect(schema.required).toEqual(Object.keys(schema.properties ?? {}));
    expect(schema.required).toContain("visualFormat");
    expect(schema.required).toContain("requiredCapabilities");
  });

  it("keeps retired split frames readable in old projects but out of new concept responses", () => {
    const input = {
      id: "legacy-split",
      name: "Legacy split",
      hook: "Yes / But",
      angle: "Two contrasting ideas",
      visualTreatment: "A split frame",
      visualFormat: "split-left",
      requiredCapabilities: ["split-frame"],
      slideOutline: ["Cover", "Contrast", "CTA"],
      cta: "Save this",
    };
    expect(ConceptSchema.safeParse(input).success).toBe(true);
    expect(GeneratedConceptSchema.safeParse(input).success).toBe(false);
    expect(GeneratedConceptSchema.safeParse({ ...input, requiredCapabilities: ["semantic-components"] }).success).toBe(true);
    const schema = z.toJSONSchema(GeneratedConceptSchema) as unknown as { properties: { requiredCapabilities: { items: { enum: string[] } } } };
    expect(schema.properties.requiredCapabilities.items.enum).not.toContain("split-frame");
  });

  it("keeps every visual-reference field strict-provider compatible", () => {
    const schema = z.toJSONSchema(VercelVisualReferenceDossierSchema) as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.required).toEqual(Object.keys(schema.properties ?? {}));

    const references = schema.properties?.references as {
      items?: { properties?: Record<string, unknown>; required?: string[] };
    } | undefined;
    expect(references?.items?.required).toEqual(Object.keys(references?.items?.properties ?? {}));
    expect(references?.items?.properties?.url).not.toHaveProperty("format");
  });

  it("marks internet visual examples as reference-only", () => {
    const reference = {
      title: "Example",
      url: "https://example.com/post",
      sourceType: "editorial-reference",
      observedPattern: "A single headline and a stable lower art zone.",
      relevance: "Useful for pacing this educational carousel.",
      confidence: "high",
      accessedAt: new Date().toISOString(),
    };
    const dossier = {
      summary: "A bounded visual reference dossier.",
      layoutPatterns: ["Keep one composition system."],
      toneAndPacing: [],
      avoid: ["Do not copy the artwork."],
      references: [{ ...reference, usage: "reference-only" }],
    };
    expect(VisualReferenceDossierSchema.parse(dossier).references[0].usage).toBe("reference-only");
    expect(VisualReferenceDossierSchema.safeParse({ ...dossier, references: [{ ...reference, usage: "final-asset" }] }).success).toBe(false);
  });

  it("keeps the Vercel internet-asset schema strict and URI-format free", () => {
    const schema = z.toJSONSchema(VercelInternetAssetDossierSchema) as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.required).toEqual(Object.keys(schema.properties ?? {}));
    const assets = schema.properties?.assets as { items?: { properties?: Record<string, unknown>; required?: string[] } } | undefined;
    expect(assets?.items?.required).toEqual(Object.keys(assets?.items?.properties ?? {}));
    expect(assets?.items?.properties?.sourcePageUrl).not.toHaveProperty("format");
    expect(assets?.items?.properties?.assetUrl).not.toHaveProperty("format");
  });

  it("validates sourced asset URLs before they can be downloaded", () => {
    const candidate = {
      title: "Reusable diagram",
      sourcePageUrl: "https://example.com/source",
      assetUrl: "https://example.com/diagram.png",
      publisher: "Example",
      recommendedRole: "supporting",
      canReplaceMascot: false,
      visualFit: "Supports an explanatory slide.",
      usageRights: "creative-commons",
      rightsEvidence: "The source page identifies a Creative Commons licence.",
      attribution: "Example creator",
      accessedAt: new Date().toISOString(),
    };
    expect(GeneratedInternetAssetDossierSchema.parse({ summary: "One candidate", assets: [candidate] }).assets).toHaveLength(1);
    expect(GeneratedInternetAssetDossierSchema.safeParse({ summary: "Bad URL", assets: [{ ...candidate, assetUrl: "not-a-url" }] }).success).toBe(false);
  });

  it("accepts Auto or an explicit slide count from 3 to 9", () => {
    const base = {
      id: "slide-count",
      title: "Slide count",
      brief: "A valid slide count brief",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(ProjectSchema.parse({ ...base, slideCount: null }).slideCount).toBeNull();
    expect(ProjectSchema.parse({ ...base, slideCount: 3 }).slideCount).toBe(3);
    expect(ProjectSchema.safeParse({ ...base, slideCount: 2 }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, slideCount: 10 }).success).toBe(false);
  });

  it("rejects storyboards outside Instagram's carousel range", () => {
    const parsed = StoryboardSchema.safeParse({ title: "x", narrative: "x", slides: [], caption: "x", hashtags: [] });
    expect(parsed.success).toBe(false);
  });

  it("requires valid source URLs", () => {
    const parsed = ProjectSchema.safeParse({
      id: "test",
      title: "Test",
      brief: "A valid brief",
      sourceNotes: "",
      sourceUrls: ["not-a-url"],
      screenshotPaths: [],
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      concepts: [],
      renderPaths: [],
      qaReports: [],
      qaPasses: 0,
      logs: [],
      demoMode: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("stores bounded final-editor layer overrides", () => {
    const slide = {
      index: 1,
      role: "cover",
      layout: "hero",
      heading: "Move this heading",
      body: ["Editable body"],
      visualDirection: "A movable Mascot",
      editor: {
        content: { x: 18, y: 24, rotation: -12, hidden: false },
        asset: { x: 55, y: 48, hidden: true },
      },
    };
    const parsed = StoryboardSchema.parse({
      title: "Editor test",
      narrative: "Test editable export data",
      slides: [slide, { ...slide, index: 2, role: "content", eyebrow: "STEP 1" }, { ...slide, index: 3, role: "cta", eyebrow: "SAVE THIS" }],
      caption: "Test caption",
      hashtags: [],
    });
    expect(parsed.slides[0].editor?.content).toEqual({ x: 18, y: 24, rotation: -12, hidden: false });
    expect(parsed.slides[0].editor?.asset?.hidden).toBe(true);
    expect(parsed.visualSystem.family).toBe("legacy-freeform");
  });

  it("stores expressive renderer primitives and their editor ordering", () => {
    const slide = {
      index: 1,
      role: "cover",
      layout: "split",
      heading: "Yes, but",
      body: [],
      visualDirection: "A real split frame",
      splitFrame: { orientation: "diagonal", ratio: 48, firstColor: "#EAF6FF", secondColor: "#F1E9FF", firstText: "YES", secondText: "BUT" },
      extraTextBlocks: [{ id: "textBlock1", text: "Independent", x: 10, y: 30, width: 35, zIndex: 5 }],
      primitives: [{ id: "primitive1", kind: "arrow", x: 35, y: 60, width: 25, height: 4, zIndex: 2 }],
      callout: "Character-linked",
      calloutStyle: "speech",
      calloutTail: "right",
      calloutAnchor: "asset",
      layerOrder: { content: 6, asset: 3 },
      editor: { textBlock1: { zIndex: 7, hidden: false } },
    };
    const parsed = StoryboardSchema.parse({ title: "Renderer", narrative: "Capabilities", slides: [slide, { ...slide, index: 2 }, { ...slide, index: 3 }], caption: "Caption", hashtags: [] });
    expect(parsed.slides[0].splitFrame?.orientation).toBe("diagonal");
    expect(parsed.slides[0].extraTextBlocks[0].id).toBe("textBlock1");
    expect(parsed.slides[0].primitives[0].kind).toBe("arrow");
    expect(parsed.slides[0].editor?.textBlock1?.zIndex).toBe(7);
  });

  it("clamps provider-generated extra text to renderer-safe font bounds", () => {
    const normalized = normalizeGeneratedStoryboard({
      slides: [{
        assetScale: 100,
        extraTextBlocks: [{ id: "textBlock1", text: "Recap", x: 95, y: 20, width: 30, fontSize: 16, weight: 500, rotation: 0, zIndex: 4 }],
        primitives: [{ id: "primitive1", kind: "arrow", x: 20, y: 20, width: 10, height: 2, strokeWidth: 2, opacity: 1, radius: 0, rotation: 270, zIndex: 1 }],
      }],
    }) as { slides: Array<{ assetScale: number; extraTextBlocks: Array<{ x: number; fontSize: number }>; primitives: Array<{ rotation: number }> }> };
    expect(normalized.slides[0].extraTextBlocks[0].fontSize).toBe(18);
    expect(normalized.slides[0].extraTextBlocks[0].x).toBe(90);
    expect(normalized.slides[0].primitives[0].rotation).toBe(180);
    expect(normalized.slides[0].assetScale).toBe(90);
  });

  it("treats provider nulls as omitted only for optional storyboard fields", () => {
    const slide = {
      index: 1, role: "cover", layout: "hero", heading: "Heading", visualDirection: "Mascot",
      badge: null, semanticComponent: null, splitFrame: null, editor: null,
      eyebrow: null, subheading: null, body: null, extraTextBlocks: null,
      layerOrder: { asset: null, content: 4 },
    };
    const input = {
      title: "Nullable provider output", narrative: "Test", caption: "Caption", hashtags: [],
      slides: [slide, { ...slide, index: 2 }, { ...slide, index: 3 }],
    };
    const parsed = StoryboardSchema.parse(normalizeGeneratedStoryboard(input));
    expect(parsed.slides[0].badge).toBeUndefined();
    expect(parsed.slides[0].semanticComponent).toBeUndefined();
    expect(parsed.slides[0].body).toEqual([]);
    expect(parsed.slides[0].layerOrder).toEqual({ content: 4 });

    const invalid = { ...input, slides: [{ ...slide, heading: null }, { ...slide, index: 2 }, { ...slide, index: 3 }] };
    expect(StoryboardSchema.safeParse(normalizeGeneratedStoryboard(invalid)).success).toBe(false);
  });

  it("rejects duplicate or non-contiguous slide indexes", () => {
    const slide = { index: 1, role: "cover", layout: "hero", heading: "Heading", body: [], visualDirection: "Mascot" };
    const parsed = StoryboardSchema.safeParse({
      title: "Bad indexes",
      narrative: "Test",
      slides: [slide, { ...slide, index: 1 }, { ...slide, index: 3 }],
      caption: "Caption",
      hashtags: [],
    });
    expect(parsed.success).toBe(false);
  });
});
