import { describe, expect, it } from "vitest";
import { fallbackDecision,canonicalIntakeBrief } from "./intake";

describe("intake fallback", () => {
  it.each(['poster','story','carousel'])('preserves authoritative source bytes when routing %s',format=>{
    const brief=`Create a ${format}. Headline: "Keep the work moving." Include the exact small label "Illustrative audit". Use 1080 × 1350; keep NASA’s credit.`;
    expect(canonicalIntakeBrief(brief,[])).toBe(brief);
    const answered=canonicalIntakeBrief(brief,[{question:'Supporting copy?',answer:'Draft the supporting copy as requested.'}]);
    expect(answered.slice(0,brief.length)).toBe(brief);expect(answered).toContain('label "Illustrative audit".');expect(answered).not.toContain('"Illustrative audit."');expect(answered).toContain('Draft the supporting copy as requested.');
  });
  it("asks for a topic when a request only names the audience and format", () => {
    const decision = fallbackDecision("a parent facing article", []);
    expect(decision.type).toBe("article");
    expect(decision.missing).toBe("subject");
    expect(decision.question).toBeNull();
  });

  it("routes an article when a topic is supplied", () => {
    const decision = fallbackDecision("a parent-facing article about exam stress", []);
    expect(decision.type).toBe("article");
    expect(decision.question).toBeNull();
    expect(fallbackDecision("an article about AI", []).question).toBeNull();
  });
});
