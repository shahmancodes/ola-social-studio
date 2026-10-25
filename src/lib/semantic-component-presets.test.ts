import { describe, expect, it } from "vitest";
import { SemanticComponentSchema } from "./schemas";
import { createSemanticComponent, SEMANTIC_COMPONENT_CHOICES } from "./semantic-component-presets";

describe("editor structured-visual picker", () => {
  it("offers all registered renderer components with valid editable examples", () => {
    expect(SEMANTIC_COMPONENT_CHOICES).toHaveLength(34);
    expect(new Set(SEMANTIC_COMPONENT_CHOICES.map((choice) => choice.kind)).size).toBe(34);
    for (const choice of SEMANTIC_COMPONENT_CHOICES) {
      const component = createSemanticComponent(choice.kind);
      expect(component.kind).toBe(choice.kind);
      expect(SemanticComponentSchema.safeParse(component).success).toBe(true);
    }
  });
});
