import { describe, expect, it } from "vitest";
import { SemanticComponentSchema } from "./schemas";
import { createSemanticComponent, semanticComponentModelGuide } from "./semantic-component-presets";
import { semanticComponentHtml } from "./semantic-components";
import { semanticValue } from "./semantic-charts";

describe("semantic library design contracts", () => {
  it("distinguishes the current progress stage from completed work", () => {
    const progress = createSemanticComponent("progress");
    for (const activeIndex of [0, 3, 5]) {
      const component = { ...progress, activeIndex };
      const html = semanticComponentHtml(component);
      expect(html.match(/class="done"/g) || []).toHaveLength(activeIndex);
      expect(html).toContain(`${activeIndex} of 6 steps completed`);
      expect(html).toContain('aria-current="step"');
      expect(html).toContain(progress.items[activeIndex].label);
      expect(semanticComponentHtml(component, "", "", true)).not.toContain("steps completed");
    }
  });

  it("keeps each comparison pair together without implying one option is wrong", () => {
    const html = semanticComponentHtml(createSemanticComponent("comparison"));
    expect(html).toContain('role="table"');
    expect(html.match(/class="rd-compare-pair"/g)).toHaveLength(2);
    expect(html).not.toMatch(/[✕✓]/);
    expect(html).toContain('First difference</p><p role="cell">Better alternative');
  });

  it("shows numeric axes and every period or bin label", () => {
    for (const kind of ["lineChart", "histogram", "scatterPlot"] as const) {
      const component = createSemanticComponent(kind), html = semanticComponentHtml(component);
      expect(html).toContain('<desc>');
      expect(html).not.toMatch(/NaN|Infinity/);
      for (const item of component.items) expect(html).toContain(item.label);
      expect(html).toMatch(/<text[^>]*>0%?<\/text>/);
    }
    const signed = SemanticComponentSchema.parse({ kind: "lineChart", items: [{ label: "Jan", value: -20 }, { label: "Feb", value: 0 }, { label: "Mar", value: 30 }] });
    expect(semanticComponentHtml(signed)).toMatch(/<text[^>]*>-20<\/text>/);
  });

  it("keeps stack values visible and rejects negative parts and frequencies", () => {
    expect(semanticComponentHtml(createSemanticComponent("stackedBar"))).toContain("50% · 30% · 20%");
    for (const kind of ["histogram", "stackedBar"] as const) {
      const component = createSemanticComponent(kind);
      component.items[0].value = -1;
      expect(SemanticComponentSchema.safeParse(component).success).toBe(false);
      expect(semanticComponentHtml(component)).toContain('role="alert"');
    }
  });

  it("renders all new structures at their supported item counts and escapes authored copy", () => {
    const guide = semanticComponentModelGuide();
    for (const kind of ["processSteps", "metricGrid", "bulletChart"] as const) {
      expect(guide).toContain(kind);
      for (const count of [2, 3, 4]) {
        const component = createSemanticComponent(kind);
        component.items = Array.from({ length: count }, (_, i) => ({ ...component.items[i % component.items.length], label: `Label ${i + 1} <script>` }));
        const parsed = SemanticComponentSchema.parse(component), html = semanticComponentHtml(parsed);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toMatch(/NaN|Infinity/);
      }
      const component = createSemanticComponent(kind);
      expect(SemanticComponentSchema.safeParse({ ...component, items: Array(5).fill(component.items[0]) }).success).toBe(false);
    }
  });

  it("preserves exceeded targets and reports invalid draft data", () => {
    const component = createSemanticComponent("bulletChart");
    const html = semanticComponentHtml(component);
    expect(html).toContain('data-actual="92"');
    expect(html).toContain('data-target="90"');
    expect(html).toContain("92% / 90%");
    component.items[0].value2 = 0;
    expect(SemanticComponentSchema.safeParse(component).success).toBe(false);
    expect(semanticComponentHtml(component)).toContain('role="alert"');
    expect(semanticComponentHtml({ ...createSemanticComponent("progress"), items: [] })).toContain('role="alert"');
  });

  it("formats currency as a prefix and separates named units", () => {
    expect(semanticValue(4200, "$" )).toBe("$4,200");
    expect(semanticValue(42, "%")).toBe("42%");
    expect(semanticValue(12.5, "hours")).toBe("12.5 hours");
  });
});
