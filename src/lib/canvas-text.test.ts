import { describe, expect, it } from "vitest";
import { canvasTexts, updateCanvasText } from "./canvas-text";
import { composePage, resolvedComponent } from "./composition";
import type { SceneElement, VisualScene } from "./content-layout";

const text = (value: string, extra: Partial<SceneElement> = {}): SceneElement => ({ kind: "text", text: value, x: 10, y: 20, w: 300, h: 90, size: 40, weight: "bold", color: "#FFFFFF", align: "center", fontFamily: "OlaHeading", lines: [value], ...extra } as SceneElement);
const scene = (elements: SceneElement[]): VisualScene => ({ width: 1080, height: 1350, background: "#111111", elements });

describe("inline canvas copy", () => {
  it("edits a diagram's canonical segment without exposing or replacing its reference", () => {
    const page = composePage({ title: "The process", body: "Plan → Build → Review" }, { family: "diagram-led", intent: { goal: "Show the process", relationship: "sequence", reason: "Keep stages clear" }, bodyMode: "sequence", separator: " → " });
    const [target] = canvasTexts(scene([text("Build", { id: "semanticComponent.items.1.label", copyId: "body-1", copySource: "body" })]), page);
    expect(target.text).toBe("Build");
    expect(target).toMatchObject({ fontFamily: "OlaHeading", fontSize: 40, color: "#FFFFFF", align: "center" });
    const edited = updateCanvasText(page, target, "Create");
    expect(edited.body).toBe("Plan → Create → Review");
    expect(edited.semanticComponent?.items[1].label).toBe("@copy:body-1");
    expect(resolvedComponent(edited)?.items[1].label).toBe("Create");
    expect(page.body).toBe("Plan → Build → Review");
    expect(() => updateCanvasText(page, target, "Create → Ship")).toThrow(/separator/);
  });
  it("edits only the clicked repeated checklist item and preserves separators", () => {
    const page = { title: "Checklist", body: "Repeat\n\nRepeat\nFinish" };
    const targets = canvasTexts(scene([text("Repeat", { id: "body" }), text("Repeat", { id: "body-1" }), text("Finish", { id: "body-2" })]), page);
    expect(updateCanvasText(page, targets[1], "Different").body).toBe("Repeat\n\nDifferent\nFinish");
    expect(() => updateCanvasText({ ...page, body: "Changed elsewhere" }, targets[1], "Different")).toThrow(/changed/);
  });
  it("maps structured copy while leaving brand and numbering alone", () => {
    const page = { title: "Headline", body: "Body", visualContent: { kind: "checklist" as const, items: [{ label: "Label", detail: "Detail" }] } };
    const targets = canvasTexts(scene([text("Brand", { id: "brand" }), text("01", { id: "step-0" }), text("Headline", { id: "title" }), text("Detail", { id: "item-0-detail" })]), page);
    expect(targets.map(t => t.source)).toEqual(["title", "visualContent.items.0.detail"]);
    expect(updateCanvasText(page, targets[1], "Updated").visualContent.items[0]).toEqual({ label: "Label", detail: "Updated" });
  });
  it("supports older unnamed scene text and preserves its actual geometry", () => {
    const page = { title: "Hello", body: "Body" };
    expect(canvasTexts(scene([text("Hello")]), page)[0]).toMatchObject({ source: "title", x: 10, y: 20, width: 300, height: 90 });
  });
});
