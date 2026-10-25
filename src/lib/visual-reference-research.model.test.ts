import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("./workflow-model", () => ({ workflowModelConfigured: () => true, askWorkflowModel: model.ask }));

import { planVisualReferences } from "./visual-reference-research";

describe("master visual reference decision", () => {
  beforeEach(()=>model.ask.mockReset());
  it("uses the coordinator's decision independently of fallback keywords", async () => {
    model.ask.mockResolvedValueOnce({ needed: true, focus: "Inspect parent-facing learning guides", reason: "Editorial patterns would help the reader." });
    const plan = await planVisualReferences({ type: "article", brief: "Write a parent-facing guide", brand: {}, localReferences: [] });
    expect(plan.needed).toBe(true);
    expect(model.ask.mock.calls[0][1]).toContain("independent of factual research");
  });
  it("shows the coordinator actual reference pixels and notes instead of inferring a layout from filenames",async()=>{
    const images=['data:image/jpeg;base64,logo','data:image/jpeg;base64,example'];
    model.ask.mockResolvedValueOnce({needed:true,focus:'Find relevant explanatory reading structures',reason:'The identity specimens do not establish a useful explanation layout.'});
    await planVisualReferences({type:'carousel',brief:'Explain how a handoff loses context',brand:{designSystem:{family:'editorial',notes:['Keep the official palette.']}},localReferences:['Editorial inspiration','Brand'],referenceImages:images,referenceNotes:['The first image is an identity specimen.']});
    expect(model.ask.mock.calls[0][2]).toEqual(images);
    expect(model.ask.mock.calls[0][1]).toContain('The first image is an identity specimen.');
    expect(model.ask.mock.calls[0][1]).toContain('Filenames alone are not evidence');
    expect(model.ask.mock.calls[0][1]).toContain('No composition family');
    expect(model.ask.mock.calls[0][1]).not.toContain('"family":"editorial"');
    expect(model.ask.mock.calls[0][1]).toContain('Keep the official palette.');
  });
  it("can skip extra research when actual brief-specific evidence is sufficient",async()=>{
    model.ask.mockResolvedValueOnce({needed:false,focus:'',reason:'The supplied sequence demonstrates the requested comparison clearly.'});
    const plan=await planVisualReferences({type:'carousel',brief:'Use this approved comparison sequence',brand:{},referenceImages:['data:image/jpeg;base64,sequence']});
    expect(plan.needed).toBe(false);
  });
});
