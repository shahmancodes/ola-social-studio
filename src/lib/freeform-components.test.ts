import { describe, expect, it } from "vitest";
import { DesignSpecSchema } from "./freeform-design";
import { createSemanticComponent, SEMANTIC_COMPONENT_CHOICES } from "./semantic-component-presets";

describe("free-form structured components", () => {
  it("keeps every library component editable as a canvas element", () => {
    for (const choice of SEMANTIC_COMPONENT_CHOICES) {
      const artifact = DesignSpecSchema.parse({
        type: "design", title: "Example", background: "#FFFFFF",
        size: { label: "Digital", widthPx: 1080, heightPx: 1350 },
        elements: [{ kind: "component", component: createSemanticComponent(choice.kind), x: 0.1, y: 0.2, width: 0.8, height: 0.45 }],
      });
      expect(artifact.elements[0].kind).toBe("component");
      if (artifact.elements[0].kind === "component") expect(artifact.elements[0].component.kind).toBe(choice.kind);
    }
  });
});
