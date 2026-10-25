import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { SimpleArtifact } from "./simple-content";

const fixture = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("./workflow-model", () => ({ workflowModelConfigured: () => true, askWorkflowModel: fixture.review }));
vi.mock("./internet-assets", () => ({ safeRemoteUrl: async (url: string) => new URL(url) }));
vi.mock("./artifact-repair", () => ({ requiredCopyIssues: () => [], contentForEvidence: () => ({ detail: "YAML jobs run on runners, organized into stages; parent-child and multi-project pipelines." }) }));
import { reviewContentEvidence } from "./quality-gates";
import * as excerpts from "./evidence-excerpts";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("evidence QA input", () => {
  it("keeps all eight sources as complete JSON with relevant late passages", async () => {
    const sources = Array.from({ length: 8 }, (_, index) => ({ title: `Docs ${index}`, url: `https://example.com/${index}`, claim: `YAML jobs run on runners in stages; parent-child and multi-project pipelines. Source ${index}.` }));
    const fact = "YAML jobs run on runners in stages. Parent-child and multi-project pipelines are supported.";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<nav>${"Menu ".repeat(35000)}</nav><main>${"Introductory background. ".repeat(3000)}${fact}</main>`, { headers: { "content-type": "text/html" } })));
    fixture.review.mockResolvedValue({ passed: true, issues: [], summary: "Verified" });
    await reviewContentEvidence({ researchSources: sources } as SimpleArtifact, "Compare products", {}, true);
    const prompt = fixture.review.mock.calls[0][1] as string;
    const evidence = JSON.parse(prompt.split("Reopened sources: ")[1].split(". Acquired-image credit evidence: ")[0]) as Array<{ url: string; excerpt: string }>;
    expect(evidence).toHaveLength(8);
    expect(evidence.map(source => source.url)).toEqual(sources.map(source => source.url));
    expect(evidence.every(source => source.excerpt.includes(fact))).toBe(true);
    expect(evidence.reduce((size, source) => size + source.excerpt.length, 0)).toBeLessThanOrEqual(30_000);
  });

  it("does not turn a source parser bug into an evidence failure or invoke model QA", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Research text. ".repeat(20), {headers:{"content-type":"text/plain"}})));
    vi.spyOn(excerpts, "readableEvidence").mockImplementation(() => { throw new ReferenceError("readableEvidence is not defined"); });
    await expect(reviewContentEvidence({researchSources:[{url:"https://example.com/nasa",claim:"Mission facts"}]} as SimpleArtifact,"Explain the mission",{},true)).rejects.toThrow(ReferenceError);
    expect(fixture.review).not.toHaveBeenCalled();
  });

  it("accepts Markdown sources and still surfaces unavailable sources", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("# Pipeline architecture\n" + "Runners execute jobs. ".repeat(10), { headers: { "content-type": "text/markdown" } })).mockResolvedValueOnce(new Response("Gone", { status: 404 })));
    fixture.review.mockResolvedValue({ passed: true, issues: [], summary: "Verified" });
    const result = await reviewContentEvidence({ researchSources: [{ url: "https://example.com/docs", claim: "Runners execute jobs" }, { url: "https://example.com/gone", claim: "No evidence" }] } as SimpleArtifact, "Compare products", {}, true);
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual([expect.stringContaining("Could not reopen cited source https://example.com/gone")]);
    expect(fixture.review.mock.calls[0][1]).toContain("Runners execute jobs");
  });
});

it('supplies bound image-source evidence even when the message needs no factual research',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-evidence-handoff-'));
 try{
  const bytes=Buffer.from('verified-photo'),localPath=path.join(dir,'photo.png'),sha256=crypto.createHash('sha256').update(bytes).digest('hex');await fs.writeFile(localPath,bytes);
  const attribution='Photo: Example / CC BY 4.0',sourcePageUrl='https://example.org/photo',assetUrl='https://example.org/photo.png';
  const artifact={type:'poster',headline:'Look again',subline:'Notice one detail.',cta:'',assetId:'photo',credit:attribution,researchSources:[],artwork:[{title:'A real staircase',sourcePageUrl,assetUrl,rights:'CC BY 4.0',attribution,use:true,status:'downloaded',localPath,sha256,assetId:'photo',reason:'Viewpoint',review:{approved:true,rightsVerified:true,sourceMatches:true,reason:'Checked'},acquisitionEvidence:{version:1,checkedAt:'2026-10-25T00:00:00Z',sha256,sourcePageUrl,assetUrl,attribution,sources:[{url:sourcePageUrl,text:'A real staircase by Example under CC BY 4.0.'}]}}]} as SimpleArtifact;
  fixture.review.mockImplementation(async(_schema, prompt:string)=>{
   const records=JSON.parse(prompt.split('Acquired-image credit evidence: ')[1].split('. The acquired-image evidence')[0]);
   expect(records).toHaveLength(1);expect(records[0].sources[0].text).toContain('by Example');expect(prompt).toContain('not evidence for campaign');
   return {passed:true,issues:[],summary:'Credit supported by the acquired-image evidence.'};
  });
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const result=await reviewContentEvidence(artifact,'A concise observation poster.',{},false);
  expect(result.passed).toBe(true);expect(fetch).not.toHaveBeenCalled();
  const factSensitive=await reviewContentEvidence(artifact,'An unsupported factual claim.',{},true);expect(factSensitive.passed).toBe(false);expect(factSensitive.issues).toContain('This fact-sensitive brief has no verified sources.');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

it('provides authoritative supporting counts without charging the closing CTA to that budget',async()=>{
 const artifact={type:'poster',headline:'One useful check',subline:'Pick one small check that matches your focused question and evidence you can access now.',cta:'Choose one useful next check.',artwork:[],researchSources:[],visualContent:{kind:'checklist',items:[{label:'Evidence fit',detail:'Can you access it now?'}]}} as SimpleArtifact;
 fixture.review.mockImplementation(async(_schema,prompt:string)=>{
  const counts=JSON.parse(prompt.split('Deterministic per-page supporting-word counts: ')[1].split('. These counts')[0]);expect(counts).toEqual([{page:1,words:22,min:12,max:22}]);expect(prompt).toContain('Headline and closing CTA are excluded.');return{passed:true,issues:[],summary:'In-range supporting copy, separate exact CTA.'};
 });
 expect((await reviewContentEvidence(artifact,'Write 12–22 useful supporting words per page.',{},false)).passed).toBe(true);
});
