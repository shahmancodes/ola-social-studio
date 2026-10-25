import { describe, expect, it } from "vitest";
import type { SimpleArtifact } from "./simple-content";
import { editorReviewItems, reviewFixPrompt, reviewOlaTarget, reviewSource } from "./editor-review";

const artifact = { type: "carousel", slides: [{ title: "One", body: "Body", composition: { blocks: [{ id: "hook-copy", source: "title" }] } }, { title: "Two", body: "Body" }, { title: "Three", body: "Body" }], quality: { issues: ["Page 2: Verify the source for this claim.", "Headline hierarchy is weak."], findings: [{ page: 1, targets: ["hook-copy"], problem: "Headline hierarchy is weak.", successCriterion: "Make the headline the focal point." }, { page: 30, targets: ["unrecognized-target"], problem: "A legacy target is unavailable.", successCriterion: "Check the page." }] } } as unknown as SimpleArtifact;
describe("actionable review findings", () => {
  it("separates evidence concerns, resolves copy IDs and removes duplicate legacy strings", () => {
    const items = editorReviewItems(artifact);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ category: "Facts & sources", pageIndex: 1 });
    expect(reviewSource(artifact, items[1])).toBe("title");
    expect(reviewOlaTarget(artifact, items[1])?.path).toEqual(["slides", 0, "title"]);
    expect(reviewFixPrompt(items[1])).toContain("on page 1");
  });
  it("never maps an invalid page or arbitrary geometry ID onto unrelated text", () => {
    const items = editorReviewItems(artifact);
    expect(items[2].pageIndex).toBeNull();
    expect(reviewOlaTarget(artifact, items[2])).toBeNull();
    const unknown = { ...items[2], pageIndex: 1 };
    expect(reviewSource(artifact, unknown)).toBeUndefined();
    expect(reviewOlaTarget(artifact, unknown)?.path).toEqual(["slides", 1]);
  });
  it("maps single-page canonical text to real editor paths", () => {
    const poster = { type: "poster", headline: "Heading", subline: "Body", quality: { issues: [], findings: [{ page: 1, targets: ["title"], problem: "Increase title prominence.", successCriterion: "Readable at a glance." }] } } as unknown as SimpleArtifact;
    expect(reviewOlaTarget(poster, editorReviewItems(poster)[0])?.path).toEqual(["headline"]);
  });
});
