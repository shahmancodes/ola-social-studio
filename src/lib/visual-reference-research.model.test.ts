import { describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("./workflow-model", () => ({ workflowModelConfigured: () => true, askWorkflowModel: model.ask }));

import { planVisualReferences } from "./visual-reference-research";

describe("master visual reference decision", () => {
  it("uses the coordinator's decision independently of fallback keywords", async () => {
    model.ask.mockResolvedValueOnce({ needed: true, focus: "Inspect parent-facing learning guides", reason: "Editorial patterns would help the reader." });
    const plan = await planVisualReferences({ type: "article", brief: "Write a parent-facing guide", brand: {}, localReferences: [] });
    expect(plan.needed).toBe(true);
    expect(model.ask.mock.calls[0][1]).toContain("independent of factual research");
  });
});
