import { describe, expect, it } from "vitest";
import { fallbackDecision } from "./intake";

describe("intake fallback", () => {
  it("asks for a topic when a request only names the audience and format", () => {
    const decision = fallbackDecision("a parent facing article", []);
    expect(decision.type).toBe("article");
    expect(decision.question?.text).toBe("What should the article be about?");
  });

  it("routes an article when a topic is supplied", () => {
    const decision = fallbackDecision("a parent-facing article about exam stress", []);
    expect(decision.type).toBe("article");
    expect(decision.question).toBeNull();
    expect(fallbackDecision("an article about AI", []).question).toBeNull();
  });
});
