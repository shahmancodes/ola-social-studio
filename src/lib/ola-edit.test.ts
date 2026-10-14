import { describe, expect, it } from "vitest";
import { applyOlaOperations } from "./ola-edit";
import { SimpleArtifactSchema, type SimpleArtifact } from "./simple-content";
import { DesignSpecSchema } from "./freeform-design";
import { ConceptSchema, StoryboardSchema } from "./schemas";

const post = SimpleArtifactSchema.parse({ type: "post", headline: "Before", subline: "Supporting line", caption: "Caption", designVersion: 2, researchSources: [], artwork: [] });
const article = SimpleArtifactSchema.parse({ type: "article", title: "Guide", sections: [{ id: "section-1", title: "Opening", body: "Old body", bodyJson: { type: "doc", content: [] } }], artwork: [], researchSources: [] });

describe("Ola edit operations", () => {
  it("edits only the selected component and leaves the source draft untouched", () => {
    const result = applyOlaOperations("simple", post, [{ op: "set", path: ["headline"], value: "After" }], { label: "Headline", path: ["headline"] }) as SimpleArtifact;
    expect(result).toMatchObject({ headline: "After", subline: "Supporting line" });
    expect(post.type === "post" && post.headline).toBe("Before");
    expect(() => applyOlaOperations("simple", post, [{ op: "set", path: ["subline"], value: "Outside" }], { label: "Headline", path: ["headline"] })).toThrow(/outside/);
  });

  it("removes stale rich-text JSON when rewriting an article body", () => {
    const result = applyOlaOperations("simple", article, [{ op: "set", path: ["sections", 0, "body"], value: "New body" }]) as SimpleArtifact;
    expect(result.type === "article" && result.sections[0]).toMatchObject({ body: "New body" });
    if (result.type === "article") expect(result.sections[0].bodyJson).toBeUndefined();
  });

  it("rejects queued comments whose component IDs have changed", () => {
    expect(() => applyOlaOperations("simple", article, [{ op: "set", path: ["sections", 0, "title"], value: "New" }], undefined, [{ label: "Opening section", path: ["sections", 0], id: "removed-section" }])).toThrow(/changed/);
    expect(() => applyOlaOperations("simple", article, [{ op: "set", path: ["sections", 0, "body"], value: "New" }], undefined, [{ label: "Opening body", path: ["sections", 0, "body"], anchor: { path: ["sections", 0], id: "moved-section" } }])).toThrow(/changed/);
  });

  it("rejects an invalid layout, output path and changed selected ID", () => {
    expect(() => applyOlaOperations("simple", post, [{ op: "set", path: ["layout"], value: "unknown" }])).toThrow();
    expect(() => applyOlaOperations("simple", post, [{ op: "set", path: ["imagePath"], value: "/tmp/file" }])).toThrow(/outside/);
    expect(() => applyOlaOperations("simple", article, [{ op: "set", path: ["sections", 0, "title"], value: "New" }], { label: "Section", path: ["sections", 0], id: "old-id" })).toThrow(/changed/);
  });

  it("accepts bounded visual styling and rejects invalid color", () => {
    const result = applyOlaOperations("simple", post, [{ op: "set", path: ["visualOverrides"], value: { title: { x: 0.12, fontSize: 64, color: "#123456" } } }]) as SimpleArtifact;
    expect(result.type === "post" && result.visualOverrides?.title?.fontSize).toBe(64);
    expect(() => applyOlaOperations("simple", post, [{ op: "set", path: ["visualOverrides"], value: { title: { color: "red" } } }])).toThrow();
  });

  it("keeps a selected freeform element precise while allowing a whole-page edit", () => {
    const design = DesignSpecSchema.parse({ type: "design", title: "Poster", size: { label: "Post", widthPx: 1080, heightPx: 1350 }, background: "#FFFFFF", includeLogo: true, elements: [{ id: "headline", kind: "text", text: "Original", x: 0.1, y: 0.2, width: 0.8, fontSize: 0.08, color: "#111111" }] });
    const selected = { label: "Headline", path: ["elements", 0], id: "headline" };
    expect(applyOlaOperations("design", design, [{ op: "set", path: ["elements", 0, "text"], value: "Rewritten" }], selected)).toMatchObject({ elements: [{ text: "Rewritten" }] });
    expect(() => applyOlaOperations("design", design, [{ op: "set", path: ["background"], value: "#000000" }], selected)).toThrow(/outside/);
    expect(applyOlaOperations("design", design, [{ op: "set", path: ["background"], value: "#000000" }])).toMatchObject({ background: "#000000" });
    expect(() => applyOlaOperations("design", design, [{ op: "set", path: ["includeLogo"], value: false }])).toThrow(/outside/);
  });

  it("targets concept copy and protects fixed storyboard fields", () => {
    const concepts = Array.from({ length: 3 }, (_, index) => ConceptSchema.parse({ id: `route-${index}`, name: `Route ${index}`, hook: "Old hook", angle: "Useful angle", visualTreatment: "Clear layout", slideOutline: ["Start", "Explain", "Finish"], cta: "Try it" }));
    expect((applyOlaOperations("concept", concepts, [{ op: "set", path: [0, "hook"], value: "New hook" }], { label: "Route 1", path: [0], id: "route-0" }) as typeof concepts)[0].hook).toBe("New hook");
    const storyboard = StoryboardSchema.parse({ title: "Example", narrative: "A clear progression", slides: Array.from({ length: 3 }, (_, index) => ({ index: index + 1, role: index === 2 ? "cta" : "content", layout: index === 2 ? "cta" : "split", template: index === 2 ? "brand-close" : "standard", heading: "Old heading", visualDirection: "Simple layout" })), caption: "Caption", hashtags: [] });
    expect((applyOlaOperations("storyboard", storyboard, [{ op: "set", path: ["slides", 0, "heading"], value: "New heading" }]) as typeof storyboard).slides[0].heading).toBe("New heading");
    expect(() => applyOlaOperations("storyboard", storyboard, [{ op: "set", path: ["slides", 2, "background"], value: "#FFFFFF" }])).toThrow(/outside/);
    expect(() => applyOlaOperations("storyboard", storyboard, [{ op: "set", path: ["slides", 2, "template"], value: "standard" }])).toThrow(/outside/);
  });
});
