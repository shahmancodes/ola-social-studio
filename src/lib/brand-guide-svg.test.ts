import { describe, expect, it } from "vitest";
import { BrandSchema } from "./platform";
import { buildBrandGuideSvg, paletteForBrand } from "./brand-guide-svg";

const guide = {
  tagline: "A practical company",
  personality: ["Clear", "Warm"],
  typography: "Use the supplied display font.",
  imagery: "Use real product imagery.",
  source: "Brand assets",
  generatedAt: "2026-10-13T00:00:00.000Z",
};

describe("brand guide export", () => {
  it("uses any company's own identity and includes every saved color", () => {
    const colors = ["#123456", "#234567", "#345678", "#456789", "#56789A", "#6789AB"];
    const brand = BrandSchema.parse({ colors, voice: "Direct and useful.", themeCard: guide });
    const svg = buildBrandGuideSvg("Harbor & Field", brand, "", "");
    expect(brand.wordmarkAssetId).toBeNull();
    expect(paletteForBrand(brand)).toHaveLength(colors.length);
    expect(svg).toContain("Harbor &amp; Field");
    expect(svg).toContain("Color themes");
    expect(svg).toContain("Direct and useful.");
    expect(svg).not.toContain("Wordmark");
    expect(svg).not.toContain("Company");
  });

  it("shows a separate wordmark only when one is saved", () => {
    const brand = BrandSchema.parse({ wordmarkAssetId: "wordmark-id", themeCard: guide });
    const svg = buildBrandGuideSvg("Harbor", brand, "", "data:image/png;base64,AAAA");
    expect(svg).toContain("Wordmark");
    expect(svg).toContain("data:image/png;base64,AAAA");
    expect(svg).toContain("05 / LANGUAGE");
  });

  it("grows the export for longer voice and format guidance", () => {
    const short = BrandSchema.parse({ voice: "Clear.", themeCard: guide });
    const long = BrandSchema.parse({ voice: "Explain every idea in plain language with an assured, useful tone. ".repeat(12), formatRules: "Use descriptive headings and concise examples. ".repeat(8), themeCard: guide });
    const shortSvg = buildBrandGuideSvg("Harbor", short, "", "");
    const longSvg = buildBrandGuideSvg("Harbor", long, "", "");
    const height = (svg: string) => Number(svg.match(/<svg[^>]*height="(\d+)"/)?.[1]);
    expect(height(longSvg)).toBeGreaterThan(height(shortSvg));
    expect(longSvg).toContain("concise examples.");
  });
});
