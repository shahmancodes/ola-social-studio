import { describe, expect, it } from "vitest";
import { BrandSchema } from "./platform";
import { shortlistBrandAssets } from "./content-brand";
import { brandDesignForPlanning } from './brand-design';

it('does not pass the legacy editorial default as brand evidence, preserving explicit identity and notes',()=>{
  const notes=['Use an editorial treatment for the annual report when the brief asks for one.'];
  const design=brandDesignForPlanning({family:'editorial',headingFontName:'Brand Heading',notes});
  expect(design.family).toBeUndefined();expect(design.headingFontName).toBe('Brand Heading');expect(design.notes).toEqual(notes);
});

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
