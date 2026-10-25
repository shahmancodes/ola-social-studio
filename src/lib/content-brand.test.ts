import { describe, expect, it } from "vitest";
import { BrandSchema } from "./platform";
import { shortlistBrandAssets } from "./content-brand";

describe("company asset shortlist", () => {
  it("puts brief-relevant artwork ahead of generic decoration and excludes logos", () => {
    const brand = BrandSchema.parse({ artworkAssetIds: ["practice"] });
    const asset = (id: string, name: string, category = "artwork") => ({ id, name, category, mediaType: "image/svg+xml", diskPath: `/tmp/${id}.svg`, role: "supporting" });
    const choices = shortlistBrandAssets([
      asset("sale", "black-friday-banner.svg"),
      asset("logo", "company-logo.svg", "logo"),
      asset("reference", "student-practising-reference.svg", "reference"),
      asset("other-project", "student-practising-download.png", "project-artwork"),
      asset("practice", "student-practising-questions.svg"),
    ], brand, "Help students practise one question before an exam");
    expect(choices.map((item) => item.id)).toEqual(["practice", "sale"]);
  });
});
