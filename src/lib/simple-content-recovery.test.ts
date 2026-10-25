import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  directory: "", rejectRepair: true, failComposition: false, failVisual: false,
  row: { id: "project", company_id: "company", content_type: "poster", brief: "Create a poster for developers in a friendly tone.", brand_snapshot_json: "{}", artifact_json: '{"instructions":"Keep exact supplied words"}', status: "queued", version: 1 },
  generate: vi.fn(), researchPlan: vi.fn(), visualPlan: vi.fn(), visualResearch: vi.fn(), representation: vi.fn(), artDirection: vi.fn(),
  artwork:vi.fn(), sourceAccess: vi.fn(), evidence: vi.fn(), compose: vi.fn(), select: vi.fn(), render: vi.fn(), visual: vi.fn(), preflight: vi.fn(), record: vi.fn(),
}));
vi.mock("./platform-db", () => ({ projectRow: () => fixture.row, db: () => ({ prepare: () => ({ all: () => [], run: vi.fn() }) }) }));
vi.mock("./ai-execution", () => ({ withProjectAi: (_id: string, _stage: string, task: () => Promise<unknown>) => task(), providerEnabled: (provider: string) => provider === "vercel", fallbackAllowed: () => false, modelFor: () => "test-model", projectAiPolicy: () => undefined }));
vi.mock("./ai-usage", () => ({ generateText: fixture.generate }));
vi.mock("./platform", async (original) => ({ ...await original<typeof import("./platform")>(), companyStorageDir: () => fixture.directory, getCompany: () => ({ name: "Example" }), updateProjectRecord: (_id: string, patch: { status?: string; artifact?: unknown }) => {
  if (patch.status) fixture.row.status = patch.status;
  if (patch.artifact) { fixture.row.artifact_json = JSON.stringify(patch.artifact); fixture.row.version++; }
  return { ...fixture.row };
} }));
vi.mock("./content-brand", () => ({ contentBrand: () => ({ name: "Example", assets: [], fonts: [] }), brandPrompt: () => "Example brand" }));
vi.mock("./content-specialists", () => ({ assessSpecialistBrief: fixture.preflight, contentSpecialist: () => ({ shape: "poster JSON", instructions: () => "Create a poster." }) }));
vi.mock("./workflow-state", () => ({ workflowState: () => ({ answers: [], phase: "working" }), workflowEvents: () => [], workflowContext: () => ({ answers: [] }), saveWorkflowState: vi.fn(), recordWorkflowEvent: fixture.record, recordWorkflowQa: vi.fn() }));
vi.mock("./internet-research-plan", () => ({ planInternetResearch: fixture.researchPlan }));
vi.mock("./visual-reference-research", async (original) => ({ ...await original<typeof import("./visual-reference-research")>(), planVisualReferences: fixture.visualPlan, researchVisualReferences: fixture.visualResearch }));
vi.mock("./content-representation", async (original) => ({ ...await original<typeof import("./content-representation")>(), planContentRepresentation: fixture.representation, representationDraftGuide: () => "Preserve the planned representation.", bindSuppliedCopy: (artifact: unknown) => artifact, representationRealizationIssues: (artifact: { headline: string }) => artifact.headline === "Rejected repair" ? ["Page 1: a bare process line contains unsupported stage copy."] : [] }));
vi.mock("./semantic-designer", () => ({ applyOnDemandDesigner: async (artifact: unknown) => artifact }));
vi.mock("./directed-artwork",async(original)=>({...await original<typeof import("./directed-artwork")>(),acquireDirectedArtwork:fixture.artwork}));
vi.mock("./art-direction", async (original) => ({ ...await original<typeof import("./art-direction")>(), planArtDirection: fixture.artDirection }));
vi.mock("./evidence-sources", async (original) => ({ ...await original<typeof import("./evidence-sources")>(), resolveEvidenceSources: fixture.sourceAccess }));
vi.mock("./quality-gates", () => ({ reviewContentEvidence: fixture.evidence, reviewSimpleExport: async () => ({ passed: true, issues: [], summary: "Ready" }) }));
vi.mock("./composition", async (original) => ({ ...await original<typeof import("./composition")>(), planArtifactCompositions: fixture.compose }));
vi.mock("./rendered-candidates", () => ({ selectRenderedCandidates: fixture.select, artifactReviewImages: async () => [] }));
vi.mock("./modern-content", async (original) => ({ ...await original<typeof import("./modern-content")>(), renderModernArtifact: fixture.render, reviewModernArtifact: fixture.visual }));

import { generateSimpleArtifact } from "./simple-content";
import { composePage } from "./composition";

beforeEach(async () => {
  vi.clearAllMocks();
  fixture.directory = await fs.mkdtemp(path.join(os.tmpdir(), "ola-recovery-"));
  fixture.rejectRepair = true; fixture.failComposition = false; fixture.failVisual = false;
  fixture.row.artifact_json = '{"instructions":"Keep exact supplied words"}'; fixture.row.status = "queued"; fixture.row.version = 1;
  vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-only");
  fixture.preflight.mockResolvedValue(true);
  fixture.artwork.mockResolvedValue([]);
  fixture.sourceAccess.mockImplementation(async (sources: unknown) => sources);
  fixture.researchPlan.mockResolvedValue({ needed: true, focus: "Verify facts", reason: "Named product" });
  fixture.visualPlan.mockResolvedValue({ needed: true, focus: "Layout references", reason: "Style" });
  fixture.visualResearch.mockResolvedValue({ summary: "Use a clear hierarchy", layoutPatterns: ["Typographic"], toneAndPacing: [], avoid: [], references: [{ title: "Reference", url: "https://example.com/reference", observedPattern: "Clear hierarchy", usage: "reference-only" }] });
  fixture.representation.mockResolvedValue({ version: 1, message: "Explain a workflow", sequenceReason: "One step at a time", pages: [{ page: 1, role: "explanation", goal: "Explain the workflow", form: "statement", reason: "Clear message", supportingCopy: "generate", contentNeeds: ["Explain"], assetIds: [], evidenceRefs: [0], exactCopyRefs: [] }] });
  fixture.artDirection.mockResolvedValue({ version: 1, referencePrinciples: ["Use clear hierarchy"], directions: ["editorial", "contrast", "sequence"].map(id => ({ id, name: `${id} direction`, idea: `A purposeful ${id} visual idea for the message`, attention: "A clear focal point", hierarchy: "One dominant headline", rhythm: "A readable sequence", assetStrategy: "Use native editable text" })) });
  fixture.generate.mockImplementation(async (input: { prompt?: string; messages?: Array<{ content: Array<{ text?: string }> }> }) => {
    if (input.prompt?.startsWith("Research this content brief")) return { text: JSON.stringify({ sources: [{ title: "Official docs", url: "https://example.com/docs", claim: "A verified fact" }] }), steps: [{ toolCalls: [{ toolName: "webSearch" }] }] };
    const prompt = input.messages?.[0].content[0].text ?? "";
    const repair = prompt.includes("Copy review rejected this draft");
    return { text: JSON.stringify({ headline: repair ? fixture.rejectRepair ? "Rejected repair" : "Corrected draft" : "Initial draft", subline: "A concise explanation.", cta: "Learn more", layout: "hero" }), usage: { inputTokens: 1, outputTokens: 1 } };
  });
  fixture.evidence.mockImplementation(async (artifact: { headline: string }) => ({ passed: artifact.headline !== "Initial draft", issues: artifact.headline === "Initial draft" ? ["Clarify the supplied claim."] : [], summary: "Copy reviewed" }));
  fixture.compose.mockImplementation((artifact: unknown) => {
    if (fixture.failComposition) throw new Error("Composition planning failed: fixture rejection");
    return { plans: [], candidates: [structuredClone(artifact), structuredClone(artifact), structuredClone(artifact)] };
  });
  fixture.select.mockImplementation(async (candidates: unknown[]) => ({ artifact: candidates[0], evidence: { selected: 0 } }));
  fixture.render.mockResolvedValue(undefined);
  fixture.visual.mockImplementation(async () => {
    if (fixture.failVisual) throw new Error("Provider deadline exceeded after 60000ms");
    return { pass: true, issues: [], scores: { clarity: 5, usefulness: 5, visualCraft: 5, brandFit: 5, editability: 5 }, summary: "Ready", passNumber: 1 };
  });
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(fixture.directory, { recursive: true, force: true }); });

const researchCalls = () => fixture.generate.mock.calls.filter(([input]) => input.prompt?.startsWith("Research this content brief")).length;
const copyCalls = () => fixture.generate.mock.calls.filter(([input]) => input.messages?.[0].content[0].text?.startsWith("Create a production-ready")).length;

describe("generation resumes the failed step", () => {
  it('replans rejected rendering geometry while retaining approved copy and research',async()=>{
    fixture.rejectRepair=false;
    fixture.select.mockRejectedValueOnce(new Error('No candidate passed rendering: Candidate 1: Text does not fit: body (minimum 33.0px; region 120×300px; a word needs more width).'))
      .mockImplementation(async candidates=>({artifact:candidates[0],evidence:{selected:0}}));
    await expect(generateSimpleArtifact('project')).rejects.toThrow('No candidate passed rendering');
    const filename=path.join(fixture.directory,'projects/project/generation-checkpoint.json'),saved=JSON.parse(await fs.readFile(filename,'utf8'));
    expect(saved.steps.composition).toBeUndefined();expect(saved.steps['copy-review']).toBeDefined();expect(saved.steps['repaired-copy-review']).toBeDefined();
    expect(saved.feedback['composition-render-failures'].error).toContain('region 120×300px');
    expect((await generateSimpleArtifact('project')).status).toBe('complete');
    expect(fixture.compose).toHaveBeenCalledTimes(2);expect(researchCalls()).toBe(1);expect(copyCalls()).toBe(2);
    expect(fixture.representation).toHaveBeenCalledTimes(1);expect(fixture.artDirection).toHaveBeenCalledTimes(1);
    const prompts=fixture.generate.mock.calls.map(([input])=>input.messages?.[0].content[0].text??'').filter(prompt=>prompt.includes("You are Ola's composition planner"));
    expect(prompts.at(-1)).toContain('previous complete composition set failed ACTUAL rendering');expect(prompts.at(-1)).toContain('region 120×300px');
    expect(JSON.parse(await fs.readFile(filename,'utf8')).feedback['composition-render-failures']).toBeUndefined();
  });
  it("corrects an empty visual patch and carries applied repairs into the next refinement", async () => {
    fixture.rejectRepair = false;
    fixture.select.mockImplementation(async (candidates) => {
      const artifact = candidates[0];
      const page = composePage({title:artifact.headline,body:artifact.subline,cta:artifact.cta}, {
        family:'oversized-typography',intent:{goal:'Explain clearly',relationship:'statement',reason:'One dominant idea'},responsive:{version:1,craft:{version:1}},
      });
      return {artifact:{...artifact,composition:page.composition},evidence:{selected:0}};
    });
    const scores={clarity:4,usefulness:4,visualCraft:3,brandFit:4,editability:4};
    fixture.visual.mockResolvedValueOnce({pass:false,issues:['The supporting copy is disconnected.'],scores,summary:'Refine grouping',passNumber:1})
      .mockResolvedValueOnce({pass:false,issues:['The supporting copy is still disconnected.'],scores,summary:'Refine grouping',passNumber:2})
      .mockResolvedValue({pass:true,issues:[],scores:{...scores,visualCraft:4},summary:'Ready',passNumber:3});
    const originalGenerate=fixture.generate.getMockImplementation()!;
    const repairPrompts:string[]=[];
    fixture.generate.mockImplementation(async input=>{
      const prompt=input.messages?.[0].content[0].text??'';
      if(!prompt.startsWith('Repair only the specific failed elements'))return originalGenerate(input);
      repairPrompts.push(prompt);
      const patches=repairPrompts.length===1?[]:[{target:'page-1',craft:repairPrompts.length===2?{surface:'dark'}:{rule:'top'}}];
      return {text:JSON.stringify({reason:'Improve the reading path',patches}),usage:{inputTokens:1,outputTokens:1}};
    });
    expect((await generateSimpleArtifact('project')).status).toBe('complete');
    expect(repairPrompts).toHaveLength(3);
    expect(repairPrompts[1]).toContain('Repair makes no design change');
    expect(repairPrompts[1]).toContain('Rejected patch: {"reason":"Improve the reading path","patches":[]}');
    expect(repairPrompts[2]).toContain('Prior applied repairs: [{"pass":1');
    expect(repairPrompts[2]).toContain('"surface":"dark"');
    const saved=JSON.parse(await fs.readFile(path.join(fixture.directory,'projects/project/generation-checkpoint.json'),'utf8'));
    expect(saved.feedback['visual-repair-history']).toHaveLength(2);
    const final=JSON.parse(fixture.row.artifact_json);
    expect(final.composition.responsive.craft).toMatchObject({surface:'dark',rule:'top'});
  });
  it("rechecks a failed legacy evidence report while retaining the saved research and draft", async () => {
    await expect(generateSimpleArtifact("project")).rejects.toThrow("Copy repair rejected");
    const filename = path.join(fixture.directory, "projects", "project", "generation-checkpoint.json");
    const saved = JSON.parse(await fs.readFile(filename, "utf8"));
    delete saved.steps["copy-review"].value.evidenceVersion;
    await fs.writeFile(filename, JSON.stringify(saved));
    fixture.evidence.mockResolvedValue({ passed: true, issues: [], summary: "Full evidence verified" });
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    expect(researchCalls()).toBe(1);
    expect(copyCalls()).toBe(2);
    expect(fixture.representation).toHaveBeenCalledTimes(1);
  });

  it("uses the latest rejected draft and feedback on the next copy repair", async () => {
    fixture.rejectRepair = false;
    fixture.evidence.mockResolvedValueOnce({ passed: false, issues: ["Clarify the original claim."], summary: "Needs repair" })
      .mockResolvedValueOnce({ passed: false, issues: ["Remove the unsupported runner claim instead of rephrasing it."], summary: "Still unsupported" })
      .mockResolvedValue({ passed: true, issues: [], summary: "Verified" });
    await expect(generateSimpleArtifact("project")).rejects.toThrow("Copy review failed before composition");
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    const repairs = fixture.generate.mock.calls.map(([input]) => input.messages?.[0].content[0].text as string | undefined).filter(prompt => prompt?.includes("Copy review rejected this draft"));
    expect(repairs).toHaveLength(2);
    expect(repairs[1]).toContain("Copy review rejected this draft: Remove the unsupported runner claim");
    expect(repairs[1]).toContain('Current draft: {"type":"poster","headline":"Corrected draft"');
    expect(researchCalls()).toBe(1);
    expect(fixture.representation).toHaveBeenCalledTimes(1);
  });

  it("retries copy repair without repeating research, planning, or drafting", async () => {
    await expect(generateSimpleArtifact("project")).rejects.toThrow("Copy repair rejected");
    expect(researchCalls()).toBe(1); expect(copyCalls()).toBe(2);
    fixture.rejectRepair = false;
    const result = await generateSimpleArtifact("project");
    expect(result.status).toBe("complete");
    expect(researchCalls()).toBe(1); expect(copyCalls()).toBe(3);
    expect(fixture.preflight).toHaveBeenCalledTimes(1);
    expect(fixture.researchPlan).toHaveBeenCalledTimes(1);
    expect(fixture.visualResearch).toHaveBeenCalledTimes(1);
    expect(fixture.representation).toHaveBeenCalledTimes(1);
    expect(fixture.artDirection).toHaveBeenCalledTimes(1);
    expect(fixture.artwork).toHaveBeenCalledTimes(1);
    expect(fixture.representation.mock.calls[0][0].assetContext).toContain("Actual asset acquisition results");
    expect(fixture.artDirection.mock.invocationCallOrder[0]).toBeLessThan(fixture.artwork.mock.invocationCallOrder[0]);
    expect(fixture.artwork.mock.invocationCallOrder[0]).toBeLessThan(fixture.representation.mock.invocationCallOrder[0]);
  });

  it("shortens both overlong details returned by copy repair before evidence QA", async () => {
    fixture.rejectRepair = false;
    const originalGenerate = fixture.generate.getMockImplementation()!;
    fixture.generate.mockImplementation(async (input) => {
      const prompt = input.messages?.[0].content[0].text ?? "";
      if (prompt.startsWith("Shorten only the GENERATED component copy")) return { text: JSON.stringify({ edits: [
        { source: "semanticComponent.items.0.detail", value: "Pull-request reviews support comments and approvals." },
        { source: "semanticComponent.items.1.detail", value: "YAML jobs run on runners in stages." },
      ] }), usage: { inputTokens: 1, outputTokens: 1 } };
      const result = await originalGenerate(input);
      if (prompt.includes("Copy review rejected this draft")) {
        const draft = JSON.parse(result.text);
        draft.semanticComponent = { kind: "comparison", leftTitle: "GitHub", rightTitle: "GitLab", items: [
          { label: "Review", detail: "A detailed generated description about the documented review workflow. ".repeat(3) },
          { label: "CI/CD", detail: "A detailed generated description about the documented pipeline workflow. ".repeat(3) },
        ] };
        return { ...result, text: JSON.stringify(draft) };
      }
      return result;
    });
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    expect(researchCalls()).toBe(1);
    expect(copyCalls()).toBe(2);
    const repaired = fixture.evidence.mock.calls[1][0];
    expect(repaired.semanticComponent.items.every((item: { detail: string }) => item.detail.length <= 140)).toBe(true);
    expect(repaired.headline).toBe("Corrected draft");
    expect(fixture.record).toHaveBeenCalledWith("project", "agent", "component-copy-repair", "poster", expect.any(String), expect.any(Object));
  });

  it("retries composition while preserving reviewed copy", async () => {
    fixture.rejectRepair = false; fixture.failComposition = true;
    await expect(generateSimpleArtifact("project")).rejects.toThrow("Composition planning failed");
    const reviewed = fixture.evidence.mock.calls.length;
    fixture.failComposition = false;
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    expect(researchCalls()).toBe(1); expect(copyCalls()).toBe(2);
    // Only the final placed-content QA is new; copy-draft QA is reused.
    expect(fixture.evidence.mock.calls.length).toBe(reviewed + 1);
  });

  it("retries a failed source check without researching or rewriting the draft", async () => {
    fixture.evidence.mockResolvedValueOnce({ passed: false, issues: ["Could not reopen cited source https://example.com/docs: temporary failure"], summary: "Source unavailable" })
      .mockResolvedValue({ passed: true, issues: [], summary: "Verified" });
    await expect(generateSimpleArtifact("project")).rejects.toMatchObject({ generationStep: "copy-review" });
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    expect(researchCalls()).toBe(1);
    expect(copyCalls()).toBe(1);
    expect(fixture.visualResearch).toHaveBeenCalledTimes(1);
  });

  it("replaces a newly blocked source on resume, then repairs unsupported wording in the saved draft", async () => {
    fixture.rejectRepair = false;
    fixture.evidence.mockResolvedValueOnce({ passed: false, issues: ["Could not reopen cited source https://example.com/docs: HTTP 403 or unreadable source"], summary: "Source blocked" })
      .mockImplementation(async (artifact: { headline: string }) => ({ passed: artifact.headline !== "Initial draft", issues: artifact.headline === "Initial draft" ? ["Remove the unsupported timing claim."] : [], summary: "Reviewed" }));
    await expect(generateSimpleArtifact("project")).rejects.toMatchObject({ generationStep: "copy-review" });
    const replacement = [{ title: "Accessible primary study", url: "https://example.com/study", claim: "Spacing supports retention." }];
    fixture.sourceAccess.mockResolvedValueOnce(replacement);
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    expect(fixture.sourceAccess).toHaveBeenCalledTimes(2);
    expect(researchCalls()).toBe(1);
    expect(copyCalls()).toBe(2);
    expect(fixture.evidence.mock.calls.slice(1).every(([artifact]) => artifact.researchSources[0].url === replacement[0].url)).toBe(true);
    expect(fixture.representation).toHaveBeenCalledTimes(1);
    expect(fixture.artDirection).toHaveBeenCalledTimes(1);
    expect(fixture.artwork).toHaveBeenCalledTimes(1);
    expect(fixture.representation.mock.calls[0][0].assetContext).toContain("Actual asset acquisition results");
    expect(fixture.artDirection.mock.invocationCallOrder[0]).toBeLessThan(fixture.artwork.mock.invocationCallOrder[0]);
    expect(fixture.artwork.mock.invocationCallOrder[0]).toBeLessThan(fixture.representation.mock.invocationCallOrder[0]);
  });

  it.each(["repaired-copy-review", "quality-1-evidence"])("refreshes sources after a citation is blocked at %s without regenerating saved work", async (stage) => {
    fixture.rejectRepair = false;
    const rejected = { passed: false, issues: ["Remove unsupported wording."], summary: "Repair copy" };
    const verified = { passed: true, issues: [], summary: "Verified" };
    const blocked = { passed: false, issues: ["Could not reopen cited source https://example.com/docs: HTTP 403 or unreadable source"], summary: "Source blocked" };
    fixture.evidence.mockResolvedValueOnce(rejected);
    if (stage === "quality-1-evidence") fixture.evidence.mockResolvedValueOnce(verified);
    fixture.evidence.mockResolvedValueOnce(blocked).mockResolvedValue(verified);
    await expect(generateSimpleArtifact("project")).rejects.toMatchObject({ generationStep: stage });
    const priorCalls = fixture.evidence.mock.calls.length;
    const replacement = [{ title: "Readable study", url: "https://example.com/study", claim: "Supported wording" }];
    fixture.sourceAccess.mockResolvedValueOnce(replacement);
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    expect(fixture.sourceAccess).toHaveBeenCalledTimes(2);
    expect(researchCalls()).toBe(1);
    expect(copyCalls()).toBe(2);
    expect(fixture.evidence.mock.calls.slice(priorCalls).every(([artifact]) => artifact.researchSources[0].url === replacement[0].url)).toBe(true);
  });

  it("retries visual QA without rendering again or redoing successful QA", async () => {
    fixture.rejectRepair = false; fixture.failVisual = true;
    await expect(generateSimpleArtifact("project")).rejects.toThrow("Provider deadline exceeded");
    const evidenceCalls = fixture.evidence.mock.calls.length;
    const renderCalls = fixture.render.mock.calls.length;
    fixture.failVisual = false;
    expect((await generateSimpleArtifact("project")).status).toBe("complete");
    expect(fixture.select).toHaveBeenCalledTimes(1);
    expect(fixture.render).toHaveBeenCalledTimes(renderCalls);
    expect(fixture.evidence).toHaveBeenCalledTimes(evidenceCalls);
    expect(fixture.visual).toHaveBeenCalledTimes(2);
    expect(researchCalls()).toBe(1);
  });
});
