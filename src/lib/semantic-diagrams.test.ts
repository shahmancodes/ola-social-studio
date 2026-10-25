import { describe, expect, it } from "vitest";
import { SemanticComponentSchema, SemanticComponentKindSchema } from "./schemas";
import { createSemanticComponent, semanticComponentModelGuide, SEMANTIC_COMPONENT_CHOICES } from "./semantic-component-presets";
import { semanticComponentHtml } from "./semantic-components";
import { SimpleArtifactSchema } from "./simple-content";
import { applyArtifactPatches, contentForEvidence, enforceBriefScope, RepairSchema, requiredCopyIssues } from "./artifact-repair";
import { z } from "zod";

describe("expanded semantic library", () => {
  it("registers every kind once and exposes parseable examples to generation", () => {
    expect(SEMANTIC_COMPONENT_CHOICES.map(c => c.kind).sort()).toEqual([...SemanticComponentKindSchema.options].sort());
    const examples = JSON.parse(semanticComponentModelGuide().split("Library: ")[1]);
    expect(examples).toHaveLength(34);
    for (const entry of examples) expect(SemanticComponentSchema.parse(entry.example).kind).toBe(entry.kind);
  });

  it("round-trips every component through Story, carousel and article documents", () => {
    for (const choice of SEMANTIC_COMPONENT_CHOICES) {
      const semanticComponent = createSemanticComponent(choice.kind);
      for (const artifact of [
        { type: "story", headline: "One idea", subline: "", semanticComponent },
        { type: "carousel", title: "Guide", caption: "Example", slides: Array.from({ length: 3 }, () => ({ title: "One idea", body: "", semanticComponent })) },
        { type: "article", title: "Guide", sections: [{ title: "One idea", body: "An explanation", semanticComponent }] },
      ]) expect(SimpleArtifactSchema.safeParse(JSON.parse(JSON.stringify(artifact))).success).toBe(true);
    }
  });

  it("supports 3–5 pie segments and pyramid layers, with calculated percentages", () => {
    for (const count of [3, 4, 5]) {
      const pie = SemanticComponentSchema.parse({ kind: "pieChart", items: Array.from({ length: count }, (_, index) => ({ label: `Part ${index + 1}`, value: 1 })) });
      const pyramid = SemanticComponentSchema.parse({ kind: "hierarchyPyramid", items: pie.items });
      expect(semanticComponentHtml(pie).match(/data-slice=/g)).toHaveLength(count);
      expect(semanticComponentHtml(pyramid).match(/data-layer=/g)).toHaveLength(count);
      expect(semanticComponentHtml({ ...pie, chartStyle: "donut" })).toContain("100%");
    }
    for (const count of [2, 6]) for (const kind of ["pieChart", "hierarchyPyramid"]) expect(SemanticComponentSchema.safeParse({ kind, items: Array.from({ length: count }, () => ({ label: "Part", value: 1 })) }).success).toBe(false);
    const pie = createSemanticComponent("pieChart");
    expect(SemanticComponentSchema.safeParse({ ...pie, items: pie.items.map(item => ({ ...item, value: 0 })) }).success).toBe(false);
    expect(SemanticComponentSchema.safeParse({ ...pie, unit: "%", items: pie.items.map(item => ({ ...item, value: 1 })) }).success).toBe(false);
  });

  it("preserves signed waterfall changes and rejects false closing totals", () => {
    const component = createSemanticComponent("waterfall");
    const html = semanticComponentHtml(component);
    expect(html).toContain('data-from="40" data-to="55"');
    expect(html).toContain('data-from="55" data-to="45"');
    expect(SemanticComponentSchema.safeParse({ ...component, items: component.items.map((item, i) => ({ ...item, value: i === 3 ? 999 : item.value })) }).success).toBe(false);
    const negative = SemanticComponentSchema.parse({ kind: "waterfall", items: [{ label: "Start", value: -10 }, { label: "Gain", value: 30 }, { label: "End", value: 20 }] });
    expect(semanticComponentHtml(negative)).not.toMatch(/NaN|Infinity/);
  });

  it("requires conserved flows and non-increasing funnel populations", () => {
    const flow = createSemanticComponent("proportionalFlow");
    expect(semanticComponentHtml(flow).match(/data-flow=/g)).toHaveLength(4);
    expect(SemanticComponentSchema.safeParse({ ...flow, items: flow.items.map((item, i) => ({ ...item, value: item.value + (i === 0 ? 1 : 0) })) }).success).toBe(false);
    const funnel = createSemanticComponent("conversionFunnel");
    expect(SemanticComponentSchema.safeParse({ ...funnel, items: funnel.items.map((item, i) => ({ ...item, value: i === 1 ? 2000 : item.value })) }).success).toBe(false);
  });

  it("keeps missing calendar cells distinct from zero and rejects duplicate dates", () => {
    const component = SemanticComponentSchema.parse({ kind: "calendarHeatmap", items: [{ label: "Monday", x: 0, y: 0, value: 0 }, { label: "Tuesday", x: 0, y: 1, value: 3 }] });
    expect(semanticComponentHtml(component)).toContain('data-cell="0:0" data-missing="false"');
    expect(semanticComponentHtml(component)).toContain('data-cell="1:0" data-missing="true"');
    expect(SemanticComponentSchema.safeParse({ ...component, items: [component.items[0], component.items[0]] }).success).toBe(false);
    expect(SemanticComponentSchema.safeParse({ ...component, items: component.items.map(item => ({ ...item, x: 6 })) }).success).toBe(false);
  });

  it("retains per-dot editing, independent fonts, colors and market values", () => {
    const component = SemanticComponentSchema.parse({ ...createSemanticComponent("quadrant"), style: { fontFamily: "poppins", headingFontFamily: "serif" }, items: [{ label: "Alpha", x: 80, y: 20, radius: 32, color: "#123456" }, { label: "Beta", x: 30, y: 50, radius: 6 }] });
    const html = semanticComponentHtml(JSON.parse(JSON.stringify(component)));
    expect(html).toContain('r="32" fill="#123456"');
    expect(html).toContain("--sc-heading-font:Georgia");
    expect(html).toContain("--sc-font:Poppins");
    expect(SemanticComponentSchema.safeParse({ ...component, items: component.items.map(item => ({ ...item, radius: 50 })) }).success).toBe(false);
    const market = createSemanticComponent("marketSizing");
    expect(semanticComponentHtml(market)).toContain("$100B");
    expect(semanticComponentHtml(market)).toContain("$500M");
    expect(SemanticComponentSchema.safeParse({ ...market, items: [...market.items].reverse() }).success).toBe(false);
  });

  it("escapes labels and notes in every new renderer", () => {
    for (const choice of SEMANTIC_COMPONENT_CHOICES.filter(choice => ["pieChart", "hierarchyPyramid", "hubSpoke", "conversionFunnel", "waterfall", "quadrant", "venn", "calendarHeatmap", "swimlane", "proportionalFlow", "marketSizing"].includes(choice.kind))) {
      const component = createSemanticComponent(choice.kind);
      component.items[0].label = '<img src=x onerror="bad">';
      component.note = '<script>bad()</script>';
      const html = semanticComponentHtml(component);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("includes semantic copy in QA and preserves exact-copy scope", () => {
    const component = createSemanticComponent("hierarchyPyramid");
    component.items[0].label = "Meet on Saturday";
    const artifact = SimpleArtifactSchema.parse({ type: "story", headline: "One idea", subline: "", semanticComponent: component });
    expect(JSON.stringify(contentForEvidence(artifact))).toContain("Meet on Saturday");
    expect(requiredCopyIssues(artifact, "Do not add dates.")).not.toHaveLength(0);
    expect(enforceBriefScope(artifact, "Avoid extra text.")).not.toHaveProperty("semanticComponent");
    const changed = applyArtifactPatches(artifact, { patches: [{ target: "page-1", semanticComponent: { ...component, chartStyle: "donut" } }], reason: "Style adjustment" }, "");
    expect(changed.type === "story" && changed.semanticComponent?.chartStyle).toBe("donut");
    expect(() => applyArtifactPatches(artifact, { patches: [{ target: "page-1", semanticComponent: null }], reason: "Remove" }, 'Keep "Meet on Saturday".')).toThrow(/required copy/);
    expect(() => z.toJSONSchema(RepairSchema)).not.toThrow();
  });

  it("shows an actionable validation message for invalid draft data", () => {
    const pie = createSemanticComponent("pieChart");
    const html = semanticComponentHtml({ ...pie, items: pie.items.map(item => ({ ...item, value: 0 })) });
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("honors the editor's per-item color override in every new diagram", () => {
    for (const choice of SEMANTIC_COMPONENT_CHOICES.filter(choice => ["pieChart", "hierarchyPyramid", "hubSpoke", "conversionFunnel", "waterfall", "quadrant", "venn", "calendarHeatmap", "swimlane", "proportionalFlow", "marketSizing"].includes(choice.kind))) {
      const component = createSemanticComponent(choice.kind);
      component.items[0].color = "#123456";
      expect(semanticComponentHtml(component)).toMatch(/(?:fill|stroke)="#123456"/);
    }
  });
});
