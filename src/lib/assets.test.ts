import { describe, expect, it } from "vitest";
import { getAssetCatalog, invalidStoryboardAssets, searchAssets } from "./assets";
import { StoryboardSchema } from "./schemas";

describe("optional shared asset catalogue", () => {
  it("starts empty when no shared library is installed", async () => {
    expect(await getAssetCatalog()).toEqual([]);
    expect(await searchAssets("study illustration")).toEqual([]);
  });

  it("rejects artwork paths absent from the catalogue", async () => {
    const slide = { index: 1, role: "cover", layout: "hero", heading: "Heading", body: [], asset: "made-up/missing.svg", visualDirection: "Simple" };
    const storyboard = StoryboardSchema.parse({ title: "Assets", narrative: "Test", slides: [slide, { ...slide, index: 2 }, { ...slide, index: 3 }], caption: "Caption", hashtags: [] });
    expect(await invalidStoryboardAssets(storyboard)).toEqual([1, 2, 3].map((slideIndex) => ({ slideIndex, field: "asset", path: "made-up/missing.svg" })));
  });
});
