import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SemanticComponentSchema, StoryboardSchema } from "./schemas";
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from "./semantic-components";
import { createSemanticComponent, SEMANTIC_COMPONENT_CHOICES } from "./semantic-component-presets";

const item = (label: string, detail = "", tag = "") => ({ label, detail, tag, speaker: "student" as const });

const fixtures = [
  { kind: "processLoop", items: [item("Attempt"), item("Mark"), item("Log"), item("Redo")] },
  { kind: "decisionTree", prompt: "Close to the next grade?", items: [item("Check risk", "Ask your coordinator", "YES"), item("Reconsider", "A remark may not help", "NO")] },
  { kind: "checklist", items: [item("Pack ID", "Check your bag"), item("Set alarms", "Use two")] },
  { kind: "comparison", leftTitle: "Rereading", rightTitle: "Active recall", items: [item("Feels familiar", "Tests memory"), item("Hides gaps", "Finds gaps")] },
  { kind: "timeline", items: [item("Choose gaps", "Prioritise", "7D"), item("Practise", "Mark attempts", "3D")] },
  { kind: "chatExchange", items: [item("I studied for hours"), { ...item("Try one timed set"), speaker: "mascot" as const }] },
  { kind: "annotatedExample", prompt: "Practice answer", answer: "**Name the mechanism.** Then show the consequence.", items: [item("Mechanism", "What changes?"), item("Consequence", "What follows?")] },
  { kind: "scoreBreakdown", takeaway: "Core points matter", items: [item("Subjects", "Six sevens", "42"), item("Core", "TOK + EE", "3"), item("Total", "Maximum", "45")] },
] as const;

describe("semantic carousel components", () => {
  it("accepts and renders all eight native structures", () => {
    for (const fixture of fixtures) {
      const component = SemanticComponentSchema.parse(fixture);
      const html = semanticComponentHtml(component, "/api/assets/drawings/mascot-small.svg");
      expect(html).toContain(`data-kind="${fixture.kind}"`);
      expect(html).toContain(fixture.items[0].label);
    }
    expect(SEMANTIC_COMPONENT_CSS).toContain(".rd-semantic");
  });

  it("renders all nineteen component presets with editable data and styling", () => {
    for (const choice of SEMANTIC_COMPONENT_CHOICES) {
      const component = createSemanticComponent(choice.kind);
      const html = semanticComponentHtml(component);
      expect(html).toContain(`data-kind="${choice.kind}"`);
      expect(html).toContain(component.items[0].label);
    }
    const styled = SemanticComponentSchema.parse({
      kind: "barChart", items: [item("A"), item("B")],
      style: { accent: "#123456", fontFamily: "poppins" },
    });
    expect(semanticComponentHtml(styled)).toContain("--sc-accent:#123456");
    expect(semanticComponentHtml(styled)).toContain("Poppins");
  });

  it("supports three to seven centered decision positions and rejects eight", () => {
    for (let count = 3; count <= 7; count += 1) {
      const component = SemanticComponentSchema.parse({ kind: "continuum", activeIndex: Math.floor(count / 2), items: Array.from({ length: count }, (_, index) => item(`Step ${index + 1}`)) });
      const html = semanticComponentHtml(component);
      expect(html).toContain(`--sc-count:${count}`);
      expect(html.match(/<div class="selected"><i><\/i><span>/g)).toHaveLength(1);
    }
    expect(SemanticComponentSchema.safeParse({ kind: "continuum", items: Array.from({ length: 8 }, (_, index) => item(`Step ${index + 1}`)) }).success).toBe(false);
  });

  it("keeps nested semantic fields compatible with strict provider JSON Schema", () => {
    const schema = z.toJSONSchema(StoryboardSchema) as unknown as { properties: { slides: { items: { properties: { semanticComponent: { properties: Record<string, unknown>; required: string[] } } } } } };
    const component = schema.properties.slides.items.properties.semanticComponent;
    expect(component.required).toEqual(Object.keys(component.properties));
  });

  it("escapes model-authored component text", () => {
    const component = SemanticComponentSchema.parse({ kind: "checklist", items: [item("<script>alert(1)</script>"), item("Pack") ] });
    const html = semanticComponentHtml(component);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("lays out two, three, or four loop steps with centered labels", () => {
    for (const count of [2, 3, 4]) {
      const component = SemanticComponentSchema.parse({ kind: "processLoop", items: [item("Attempt"), item("Mark"), item("Error log"), item("Redo")].slice(0, count) });
      const html = semanticComponentHtml(component);
      expect(html).toContain(`rd-loop-count-${count}`);
      expect(html.match(/class="rd-loop-node rd-loop-node-\d"/g)).toHaveLength(count);
      expect(html).toContain('class="rd-loop-label">Attempt</span>');
      expect(html).toContain("REPEAT");
      expect(html).toContain('class="rd-loop-track"');
      expect(html.match(/class="rd-loop-curve"/g)).toHaveLength(count === 3 ? 3 : 2);
      expect(html).toContain(`marker-end="url(#rd-loop-head-${count})"`);
    }
    expect(SEMANTIC_COMPONENT_CSS).toContain(".rd-loop-count-2 .rd-loop-node-2");
    expect(SEMANTIC_COMPONENT_CSS).toContain(".rd-loop-count-3 .rd-loop-node-3");
    expect(SEMANTIC_COMPONENT_CSS).toContain(".rd-loop-node-1{left:35.5%;top:0}");
    expect(SEMANTIC_COMPONENT_CSS).toContain(".rd-loop-node-2{right:0;top:35.5%}");
    expect(SEMANTIC_COMPONENT_CSS).toContain(".rd-loop-node-3{left:35.5%;bottom:0}");
    expect(SEMANTIC_COMPONENT_CSS).toContain(".rd-loop-node-4{left:0;top:35.5%}");
  });

  it("rejects malformed structures and fixed-end-card usage", () => {
    expect(SemanticComponentSchema.safeParse({ kind: "processLoop", items: [item("One"), item("Two"), item("Three"), item("Four"), item("Five")] }).success).toBe(false);
    expect(SemanticComponentSchema.safeParse({ kind: "scoreBreakdown", items: [item("A"), item("B"), item("C")] }).success).toBe(false);
    expect(StoryboardSchema.safeParse({
      title: "Test", narrative: "Test", caption: "Test", hashtags: [],
      slides: Array.from({ length: 3 }, (_, index) => ({
        index: index + 1, role: index === 2 ? "cta" : "content", layout: "editorial", template: index === 2 ? "brand-close" : "standard",
        heading: "Heading", visualDirection: "Structured", semanticComponent: index === 2 ? fixtures[2] : undefined,
      })),
    }).success).toBe(false);
  });
});
