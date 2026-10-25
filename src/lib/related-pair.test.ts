import { describe, expect, it } from "vitest";
import { SemanticComponentSchema } from "./schemas";
import { createSemanticComponent, semanticComponentModelGuide } from "./semantic-component-presets";
import { semanticComponentHtml } from "./semantic-components";
import { composePage, copyText, setCopyText } from "./composition";
import { canvasTexts } from "./canvas-text";
import { buildVisualScene, scenePng, sceneSvg } from "./content-layout";
import { sceneIssues } from "./scene-renderer";
import { mobileTextEvidence } from "./layout-readability";
import type { ContentBrand } from "./content-brand";
import { componentIntegration } from "./semantic-component-integrations";

const brand: ContentBrand = { companyId: "test", name: "Example", description: "", audience: "Readers", voice: "Plain", typography: "Manrope", imagery: "", formatRules: "", examples: [], assets: [], palette: { background: "#FFFFFF", alternate: "#EEEEEE", accent: "#163C8A", ink: "#111111", dark: "#111111" } };
const plan = { family: "diagram-led", bodyMode: "text", intent: { goal: "Explain two complementary ideas.", relationship: "relationship", reason: "The ideas are associated peers, not a sequence or decision." }, responsive: { version: 1, balance: { version: 1 }, readability: { version: 1 }, arrangement: "stack", focal: "artwork", anchor: "center", visualWeight: .6 } };

describe("implemented related-pair candidate", () => {
  it("requires exactly two peers and is available to generation", () => {
    const component = createSemanticComponent("relatedPair");
    expect(semanticComponentModelGuide()).toContain('"kind":"relatedPair"');
    for (const count of [0, 1, 3, 4]) expect(SemanticComponentSchema.safeParse({ ...component, items: Array(count).fill(component.items[0]) }).success).toBe(false);
    expect(componentIntegration("97396de5-0347-44ca-aac2-b2fdf24a3258")).toMatchObject({ decision: "implemented", kind: "relatedPair" });
    expect(componentIntegration("da566728-a2ad-4396-b540-0658068cccad")?.decision).toBe("not-added");
  });

  it("preserves and escapes article copy without extra claims or decision cues", () => {
    const component = createSemanticComponent("relatedPair");
    component.prompt = "Shared <context>";
    component.note = "Source & date";
    const html = semanticComponentHtml(component);
    for (const item of component.items) expect(html).toContain(item.detail);
    expect(html).toContain("Shared &lt;context&gt;");
    expect(html).toContain("Source &amp; date");
    expect(html).not.toMatch(/<context>|YES|NO|REPEAT|marker-end/);
  });

  it.each(["poster", "story", "post", "carousel", "presentation"] as const)("keeps labels and details editable and readable in %s", async format => {
    const component = createSemanticComponent("relatedPair");
    const page = composePage({ title: "Use both kinds of evidence", body: "", semanticComponent: component }, plan);
    const scene = await buildVisualScene(format, page, brand);
    expect((await scenePng(scene)).length).toBeGreaterThan(1000);
    expect(sceneIssues(scene)).toEqual([]);
    const texts = canvasTexts(scene, page).filter(t => t.source.startsWith("semanticComponent."));
    expect(texts).toHaveLength(5);
    expect(scene.elements.filter(e => e.kind === "image")).toHaveLength(0);
    expect(scene.elements.find(e => e.id === "related-pair-link")?.kind).toBe("line");
    expect(sceneSvg(scene)).toContain(component.items[0].label);
    const detail = texts.find(t => t.source === "semanticComponent.items.0.detail")!;
    expect(copyText(setCopyText(page, detail.copyId!, "A more precise observation."), detail.copyId!)).toBe("A more precise observation.");
    if (["story", "post", "carousel"].includes(format)) expect(mobileTextEvidence(scene).text.filter(t => t.pixels + .05 < t.minimum)).toEqual([]);
  });

  it("reflows a narrow visual group and keeps longer details inside the page", async () => {
    const component = createSemanticComponent("relatedPair");
    component.items[0].detail = "Explain the specific observation and the circumstances that made it worth discussing with the team.";
    component.items[1].detail = "Describe the surrounding context that helps the reader interpret the observation without assuming it caused the outcome.";
    const page = composePage({ title: "Connect the evidence", body: "", semanticComponent: component }, { ...plan, family: "asymmetric-editorial", responsive: { ...plan.responsive, arrangement: "columns" } });
    const scene = await buildVisualScene("poster", page, brand);
    await scenePng(scene);
    expect(scene.responsiveLayout?.groups.find(g => g.id === "artwork")?.visual?.columns).toBe(1);
    expect(sceneIssues(scene)).toEqual([]);
  });

  it("retains optional explanations, sources and font overrides as editable text", async () => {
    const component = createSemanticComponent("relatedPair");
    component.answer = "Each idea helps the reader interpret the other.";
    component.note = "Source: the supplied review guidance.";
    component.items[1].detail = "";
    component.style = SemanticComponentSchema.parse({ ...component, style: { fontFamily: "serif", headingFontFamily: "poppins" } }).style;
    const page = composePage({ title: component.prompt, body: "Use the two perspectives together.", semanticComponent: component }, plan);
    const scene = await buildVisualScene("story", page, brand);
    await scenePng(scene);
    expect(sceneIssues(scene)).toEqual([]);
    const texts = canvasTexts(scene, page);
    expect(texts.filter(t => t.text === component.prompt)).toHaveLength(1);
    expect(scene.elements.find(e => e.kind === 'text' && e.copySource === 'title')?.groupId).toBe('title');
    expect(texts.find(t => t.source === "semanticComponent.note")?.text).toBe(component.note);
    expect(texts.find(t => t.source === "semanticComponent.answer")?.fontFamily).toBe("Georgia");
    expect(texts.find(t => t.source === "semanticComponent.items.0.label")?.fontFamily).toBe("Poppins");
    expect(texts.some(t => t.source === "semanticComponent.items.1.detail")).toBe(false);
  });
});
