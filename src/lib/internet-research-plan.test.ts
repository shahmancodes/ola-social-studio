import { describe, expect, it } from "vitest";
import { fallbackInternetResearchPlan } from "./internet-research-plan";

describe("internet research fallback", () => {
  it("routes a product feature article to research", () => {
    expect(fallbackInternetResearchPlan("article", "Explain Company features to parents").needed).toBe(true);
  });

  it("routes factual work across the shared content formats", () => {
    for (const type of ["post", "story", "carousel", "presentation", "article"]) {
      expect(fallbackInternetResearchPlan(type, "Explain the current exam deadline").needed).toBe(true);
    }
  });

  it("checks physical design formats but leaves a supplied subjective brief local", () => {
    expect(fallbackInternetResearchPlan("design", "Make a printed certificate for the winner").needed).toBe(true);
    expect(fallbackInternetResearchPlan("post", "Write a playful thank-you post without statistics or unverified product claims").needed).toBe(false);
  });

  it("leaves purely visual inspiration to the separate visual coordinator", () => {
    expect(fallbackInternetResearchPlan("post", "Use a playful meme trend and bold layout").needed).toBe(false);
  });
});
