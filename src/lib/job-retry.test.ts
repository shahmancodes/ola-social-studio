import { describe, expect, it } from "vitest";
import { jobRetryDelay } from "./job-retry";

describe("automatic job retry policy", () => {
  it("retries rejected process copy with increasing delays and a finite budget", () => {
    const error = new Error("Copy repair rejected: Page 1: a bare process line contains unsupported stage copy.");
    expect(jobRetryDelay("generate-simple", error, 1, "qa")).toBe(2000);
    expect(jobRetryDelay("generate-simple", error, 2, "qa")).toBe(8000);
    expect(jobRetryDelay("generate-simple", error, 3, "qa")).toBeNull();
  });

  it.each(["OpenRouter 429: too many requests", "Provider deadline exceeded after 60000ms", "fetch failed", "Representation draft failed: Invalid output", "Copy review failed before composition: missing CTA", "Composition planning failed: unsupported layout", "Art direction planning failed: invalid directions", "The visual selector must explicitly accept the design"])("retries recoverable errors: %s", (message) => {
    expect(jobRetryDelay("generate-simple", new Error(message), 1, "generating")).toBe(2000);
  });

  it("recovers publisher access failures while keeping the retry budget finite", () => {
    const error = new Error("Evidence source check failed: Could not reopen cited source https://journal.example/paper: HTTP 403 or unreadable source");
    expect(jobRetryDelay("generate-simple", error, 1, "generating")).toBe(2000);
    expect(jobRetryDelay("generate-simple", error, 3, "generating")).toBeNull();
    expect(jobRetryDelay("generate-simple", new Error("OpenRouter 403: forbidden"), 1, "generating")).toBeNull();
  });

  it("handles provider status codes and invalid model JSON", () => {
    expect(jobRetryDelay("intake-route", Object.assign(new Error("Provider unavailable"), { statusCode: 503 }), 1, "routing")).toBe(2000);
    expect(jobRetryDelay("design-generate", new SyntaxError("Unexpected end of JSON input"), 1, "generating")).toBe(2000);
  });

  it.each(["No AI provider is configured.", "OpenRouter 401: invalid API key", "OpenRouter 402: insufficient credits", "Access denied.", "Project was cancelled.", "Project not found.", "Unexpected programming error"])("does not loop on permanent errors: %s", (message) => {
    expect(jobRetryDelay("generate-simple", new Error(message), 1, "queued")).toBeNull();
  });

  it.each(["stopped", "complete", "needs-review", "awaiting-input", "coming-soon"])("does not restart a project that is %s", (status) => {
    expect(jobRetryDelay("generate-simple", new Error("Copy repair rejected"), 1, status)).toBeNull();
  });
});
