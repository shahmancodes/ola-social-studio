import { describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("./workflow-model", () => ({
  workflowModelConfigured: () => true,
  askWorkflowModel: model.ask,
}));

import { planInternetResearch } from "./internet-research-plan";

describe("master research decision", () => {
  it("uses the coordinator's decision for a brief without keyword triggers", async () => {
    model.ask.mockResolvedValueOnce({ needed: true, focus: "Verify the named programme's public details", reason: "The reader needs accurate facts." });
    const plan = await planInternetResearch({ type: "presentation", brief: "Explain what the programme offers", brand: {}, answers: [] });
    expect(plan.needed).toBe(true);
    expect(model.ask).toHaveBeenCalledOnce();
    expect(model.ask.mock.calls[0][1]).toContain("public research could answer a question");
  });
});
