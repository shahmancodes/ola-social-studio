import { describe, expect, it } from "vitest";
import { getEditorAssetCatalog } from "./assets";

describe("optional editor asset catalogue", () => {
  it("returns empty groups when no shared artwork is installed", async () => {
    expect(await getEditorAssetCatalog()).toEqual({ mascot: [], secondary: [], uploads: [] });
  });
});
