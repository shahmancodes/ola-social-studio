import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimpleArtifact } from "./simple-content";

const fixture = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("./workflow-model", () => ({ workflowModelConfigured: () => true, askWorkflowModel: fixture.review }));
vi.mock("./internet-assets", () => ({ safeRemoteUrl: async (url: string) => new URL(url) }));
vi.mock("./artifact-repair", () => ({ requiredCopyIssues: () => [], contentForEvidence: () => ({ detail: "YAML jobs run on runners, organized into stages; parent-child and multi-project pipelines." }) }));
import { reviewContentEvidence } from "./quality-gates";
import * as excerpts from "./evidence-excerpts";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("evidence QA input", () => {
  it("keeps all eight sources as complete JSON with relevant late passages", async () => {
    const sources = Array.from({ length: 8 }, (_, index) => ({ title: `Docs ${index}`, url: `https://example.com/${index}`, claim: `YAML jobs run on runners in stages; parent-child and multi-project pipelines. Source ${index}.` }));
    const fact = "YAML jobs run on runners in stages. Parent-child and multi-project pipelines are supported.";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<nav>${"Menu ".repeat(35000)}</nav><main>${"Introductory background. ".repeat(3000)}${fact}</main>`, { headers: { "content-type": "text/html" } })));
    fixture.review.mockResolvedValue({ passed: true, issues: [], summary: "Verified" });
    await reviewContentEvidence({ researchSources: sources } as SimpleArtifact, "Compare products", {}, true);
    const prompt = fixture.review.mock.calls[0][1] as string;
    const evidence = JSON.parse(prompt.split("Reopened sources: ")[1].split(". Draft: ")[0]) as Array<{ url: string; excerpt: string }>;
    expect(evidence).toHaveLength(8);
    expect(evidence.map(source => source.url)).toEqual(sources.map(source => source.url));
    expect(evidence.every(source => source.excerpt.includes(fact))).toBe(true);
    expect(evidence.reduce((size, source) => size + source.excerpt.length, 0)).toBeLessThanOrEqual(30_000);
  });

  it("does not turn a source parser bug into an evidence failure or invoke model QA", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Research text. ".repeat(20), {headers:{"content-type":"text/plain"}})));
    vi.spyOn(excerpts, "readableEvidence").mockImplementation(() => { throw new ReferenceError("readableEvidence is not defined"); });
    await expect(reviewContentEvidence({researchSources:[{url:"https://example.com/nasa",claim:"Mission facts"}]} as SimpleArtifact,"Explain the mission",{},true)).rejects.toThrow(ReferenceError);
    expect(fixture.review).not.toHaveBeenCalled();
  });

  it("accepts Markdown sources and still surfaces unavailable sources", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("# Pipeline architecture\n" + "Runners execute jobs. ".repeat(10), { headers: { "content-type": "text/markdown" } })).mockResolvedValueOnce(new Response("Gone", { status: 404 })));
    fixture.review.mockResolvedValue({ passed: true, issues: [], summary: "Verified" });
    const result = await reviewContentEvidence({ researchSources: [{ url: "https://example.com/docs", claim: "Runners execute jobs" }, { url: "https://example.com/gone", claim: "No evidence" }] } as SimpleArtifact, "Compare products", {}, true);
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual([expect.stringContaining("Could not reopen cited source https://example.com/gone")]);
    expect(fixture.review.mock.calls[0][1]).toContain("Runners execute jobs");
  });
});
