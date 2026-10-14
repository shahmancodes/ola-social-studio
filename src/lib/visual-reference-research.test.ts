import { describe, expect, it } from "vitest";
import { fallbackVisualReferencePlan, VisualReferenceResearchSchema } from "./visual-reference-research";

describe("visual reference routing", () => {
  it("recognizes a direct visual-reference request across formats", () => {
    for (const type of ["post", "story", "carousel", "presentation", "article", "design"]) {
      expect(fallbackVisualReferencePlan(type, "Find current visual references for the layout").needed).toBe(true);
    }
  });

  it("uses local brand direction for an ordinary brief, while researching unfamiliar design formats", () => {
    expect(fallbackVisualReferencePlan("article", "Write a parent-facing article", ["Parent guide example"]).needed).toBe(false);
    expect(fallbackVisualReferencePlan("design", "Create a ceremonial cheque", []).needed).toBe(true);
  });

  it("retains exact source URLs and reference-only use", () => {
    const dossier = VisualReferenceResearchSchema.parse({ summary: "A clear editorial hierarchy", layoutPatterns: ["Strong title and short sections"], toneAndPacing: [], avoid: [], references: [{ title: "Example", url: "https://example.com/design", observedPattern: "Large title above modular sections", usage: "reference-only" }] });
    expect(dossier.references[0].url).toBe("https://example.com/design");
  });
});
