import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ status: "complete", brief: "Make a carousel", events: [] as Array<{actor: string; kind: string; body: string}>, artifact: { type: "carousel", title: "A carousel", caption: "Save this", slides: [{ title: "Hook" }, { title: "Example" }, { title: "Takeaway" }], imagePaths: ["1.png", "2.png", "3.png"] } }));
vi.mock("./platform-db", () => ({ projectRow: () => ({ id: "carousel-project", brief: fixture.brief, content_type: "carousel", status: fixture.status, artifact_json: JSON.stringify(fixture.artifact) }), db: vi.fn() }));
vi.mock("./workflow-state", () => ({ workflowState: () => null, workflowEvents: () => fixture.events }));

import { requestSnapshot } from "./request-workspace";

describe("request conversation handoff", () => {
  it("displays the original prompt and leaves answers in their conversation turns", async () => {
    fixture.brief = "Make a carousel\n\nAdditional user answers (in order):\ndevs\nProfessional";
    fixture.events = [{ actor: "user", kind: "prompt", body: "Make a carousel" }, { actor: "user", kind: "answer", body: "devs" }];
    const snapshot = await requestSnapshot("carousel-project");
    expect(snapshot.brief).toBe("Make a carousel");
    expect(snapshot.events).toContainEqual(expect.objectContaining({ kind: "answer", body: "devs" }));
    expect(fixture.brief).toContain("Additional user answers");
  });

  it("opens a completed carousel in the editor with ordered slides", async () => {
    expect((await requestSnapshot("carousel-project")).output).toMatchObject({ canOpen: true, href: "/content/carousel-project", pages: ["Hook", "Example", "Takeaway"] });
  });

  it("keeps a review draft editable", async () => {
    fixture.status = "needs-review";
    expect((await requestSnapshot("carousel-project")).output?.canOpen).toBe(true);
  });
});
