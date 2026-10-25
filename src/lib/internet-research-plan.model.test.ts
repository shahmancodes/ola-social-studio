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
it('delegates image discovery and licensing to the directed downloader without waiving factual verification',async()=>{
 model.ask.mockClear();model.ask.mockResolvedValueOnce({needed:false,focus:'',reason:'The supplied observation copy has no factual claims.'});
 await planInternetResearch({type:'story',scope:'facts',brief:'Use a reusable leaf image for an observation prompt.',brand:{},directedAssets:true});
 expect(model.ask.mock.calls[0][1]).toContain('Do NOT request copy/fact research solely for image sourcing');
 expect(model.ask.mock.calls[0][1]).toContain('does not waive verification of actual factual claims');
});
