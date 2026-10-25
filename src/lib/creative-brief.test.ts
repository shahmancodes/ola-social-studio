import { describe, expect, it } from "vitest";
import { CreativeBriefSchema, guidedBrief } from "./creative-brief";
import { inferRequestedFormat } from "./format-availability";
import { fallbackCreativeContext } from "./creative-context";

const companyId = "29da1af3-7c02-4ab9-a26e-52bbf1e3a927";
describe("guided creative brief", () => {
  it("preserves exact source copy while the selected format overrides format words in the topic", () => {
    const brief = 'Compare Instagram Story and carousel. Keep “A → B” exactly.\nDo not add a claim.';
    const input = CreativeBriefSchema.parse({ companyId, brief, format: "poster", audience: "Designers", tone: "Professional" });
    const result = guidedBrief(input);
    expect(result.slice(0, brief.length)).toBe(brief);
    expect(inferRequestedFormat(result)).toBe("poster");
    expect(fallbackCreativeContext(result, [])).toEqual({ audience: "User supplied", tone: "User supplied" });
  });
  it("retains legacy free text and lets Ola clarify missing choices", () => {
    expect(guidedBrief(CreativeBriefSchema.parse({ companyId, brief: "Make something about learning" }))).toBe("Make something about learning");
    expect(fallbackCreativeContext("Make something about learning", [])).toEqual({ audience: null, tone: null });
  });
  it("does not turn automatic slide count into a competing instruction", () => {
    expect(guidedBrief({ companyId, brief: "Create a 4-slide carousel", format: "carousel" })).not.toContain("Number of slides");
    expect(guidedBrief({ companyId, brief: "Create a carousel", format: "carousel", slideCount: 7 })).toContain("Number of slides: 7");
    expect(guidedBrief({ companyId, brief: "Create a Story", format: "story", slideCount: 7 })).not.toContain("Number of slides");
    expect(CreativeBriefSchema.safeParse({ companyId, brief: "Create a carousel", slideCount: 10 }).success).toBe(false);
  });
});
