import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BrandSchema } from "./platform";
import { brandPalette, type ContentBrand } from "./content-brand";
import { renderModernArtifact } from "./modern-content";
import { SimpleArtifactSchema } from "./simple-content";

const brand: ContentBrand = { companyId: "test", name: "Example Co", audience: "Readers", voice: "Clear", description: "", typography: "", imagery: "", formatRules: "", examples: [], palette: brandPalette(BrandSchema.parse({ colors: ["#7F22FE", "#E8F5FF", "#000000"] })), assets: [] };

describe("article visual editing", () => {
  it("exports edited rich text on the server without a browser window", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ola-rich-article-"));
    try {
      const artifact = SimpleArtifactSchema.parse({ type: "article", designVersion: 2, title: "Edited guide", sections: [{ id: "section-1", title: "First step", body: "Keep this bold.", bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this bold.", marks: [{ type: "bold" }] }] }] } }], artwork: [], researchSources: [] });
      const rendered = await renderModernArtifact(artifact, brand, directory);
      expect(rendered.type === "article" && rendered.html).toContain("<strong>Keep this bold.</strong>");
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it("uses the edited layout in the exported HTML", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ola-article-"));
    try {
      const artifact = SimpleArtifactSchema.parse({ type: "article", designVersion: 2, title: "A guide", sections: [{ id: "section-1", title: "First step", body: "Try this." }], articleStyle: { pageWidth: 760, titleSize: 64, headingSize: 32, bodySize: 20, background: "#F2F0FA", color: "#202020" }, artwork: [], researchSources: [] });
      const rendered = await renderModernArtifact(artifact, brand, directory);
      expect(rendered.type).toBe("article");
      if (rendered.type === "article") expect(rendered.html).toContain("max-width:760px");
      expect(await fs.readFile(path.join(directory, "article.html"), "utf8")).toContain("font-size:64px");
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});
