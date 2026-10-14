import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ status: "complete", artifact: { type: "carousel", title: "A carousel", caption: "Save this", slides: [{ title: "Hook" }, { title: "Example" }, { title: "Takeaway" }], imagePaths: ["1.png", "2.png", "3.png"] } }));
vi.mock("./platform-db", () => ({ projectRow: () => ({ id: "carousel-project", brief: "Make a carousel", content_type: "carousel", status: fixture.status, artifact_json: JSON.stringify(fixture.artifact) }), db: vi.fn() }));
vi.mock("./workflow-state", () => ({ workflowState: () => null, workflowEvents: () => [] }));

import { requestSnapshot } from "./request-workspace";

describe("request conversation handoff", () => {
  it("opens a completed carousel in the editor with ordered slides", async () => {
    expect((await requestSnapshot("carousel-project")).output).toMatchObject({ canOpen: true, href: "/content/carousel-project", pages: ["Hook", "Example", "Takeaway"] });
  });

  it("keeps a review draft editable", async () => {
    fixture.status = "needs-review";
    expect((await requestSnapshot("carousel-project")).output?.canOpen).toBe(true);
  });
});
