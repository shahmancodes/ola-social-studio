import { describe, expect, it } from "vitest";
import { createSemanticComponent } from "./semantic-component-presets";
import { SimpleArtifactSchema, needsResearch } from "./simple-content";

describe("structured visuals in simple formats", () => {
  const visual = createSemanticComponent("barChart");

  it("preserves editable component data in posts and stories", () => {
    for (const type of ["post", "story"] as const) {
      const artifact = SimpleArtifactSchema.parse({ type, headline: "A headline", subline: "A subline", caption: "A caption", semanticComponent: visual });
      if (artifact.type !== "post" && artifact.type !== "story") throw new Error("Unexpected artifact type");
      expect(artifact.semanticComponent?.kind).toBe("barChart");
      expect(artifact.semanticComponent?.items[0].value).toBe(42);
    }
  });

  it("preserves components in article sections and presentation or carousel slides", () => {
    const article = SimpleArtifactSchema.parse({ type: "article", title: "Article", sections: [{ title: "Section", body: "Body", semanticComponent: visual }], researchRequired: true });
    expect(article.type === "article" && article.sections[0].semanticComponent?.kind).toBe("barChart");
    expect(article.researchRequired).toBe(true);
    for (const type of ["presentation", "carousel"] as const) {
      const artifact = SimpleArtifactSchema.parse({ type, title: "Slides", caption: "Caption", slides: Array.from({ length: 3 }, (_, index) => ({ title: `Slide ${index + 1}`, body: "Body", semanticComponent: index === 1 ? visual : undefined })) });
      expect(artifact.type !== "article" && artifact.type !== "post" && artifact.type !== "story" && artifact.slides[1].semanticComponent?.kind).toBe("barChart");
    }
  });
});

describe("fact research routing", () => {
  it("does not send a general IB brief to web research just because it forbids statistics", () => {
    expect(needsResearch("Create a post for IB students. No statistics or unverified product claims.")).toBe(false);
  });

  it("requires sources for an actual current factual request", () => {
    expect(needsResearch("Explain the current exam deadline and cite the official source.")).toBe(true);
  });
});
