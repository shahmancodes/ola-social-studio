import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({ configured: true, ask: vi.fn(), fallback: true }));
vi.mock("./workflow-model", () => ({ workflowModelConfigured: () => model.configured, askWorkflowModel: model.ask }));
vi.mock("./ai-execution", () => ({ fallbackAllowed: () => model.fallback }));
import { requiredCreativeContextQuestion } from "./creative-context";
import { generateClarificationQuestion } from "./clarification-question";
import type { WorkflowAnswer } from './workflow-state';

const audience = { text: "Which readers should this GitHub and GitLab comparison help?", options: ["Developers choosing a platform", "Engineering leads", "Students learning Git"] };
const tone = { text: "How should the comparison sound to those readers?", options: ["Neutral and factual", "Friendly and explanatory", "Technical and concise"] };
beforeEach(() => { model.configured = true; model.fallback = true; model.ask.mockReset(); });

describe("LLM-authored clarification", () => {
  it.each(["poster", "carousel", "Instagram Story", "presentation", "article", "design"])("uses the model's audience question and choices for a %s", async (format) => {
    model.ask.mockResolvedValue({ audience: null, tone: null, question: audience });
    expect(await requiredCreativeContextQuestion(`Create a ${format} about GitHub vs GitLab.`, [])).toEqual({ ...audience, purpose: "audience", generatedBy: "llm" });
    expect(model.ask).toHaveBeenCalledTimes(1);
  });

  it("asks only for missing tone, using model-written text and options", async () => {
    model.ask.mockResolvedValue({ audience: "for developers", tone: null, question: tone });
    expect(await requiredCreativeContextQuestion("Create a poster for developers.", [])).toEqual({ ...tone, purpose: "tone", generatedBy: "llm" });
  });

  it("does not confuse suggested answers with a confirmed audience", async () => {
    model.ask.mockResolvedValue({ audience: null, tone: "friendly", question: audience });
    expect(await requiredCreativeContextQuestion("Create a friendly poster about GitHub vs GitLab.", [])).toMatchObject({ purpose: "audience", options: audience.options });
  });

  it("does not ask again once both fields have been supplied", async () => {
    model.ask.mockResolvedValue({ audience: "Developers", tone: "Neutral and factual", question: null });
    expect(await requiredCreativeContextQuestion("Create a poster.", [{ question: audience.text, answer: "Developers", purpose: "audience" }, { question: tone.text, answer: "Neutral and factual", purpose: "tone" }])).toBeNull();
  });

  it("rejects invented defaults and requests a fresh model-authored question", async () => {
    model.ask.mockResolvedValueOnce({ audience: "Students", tone: "Professional", question: null }).mockResolvedValueOnce(audience);
    expect(await requiredCreativeContextQuestion("Create a comparison poster.", [])).toMatchObject({ ...audience, purpose: "audience" });
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  it("asks the model to repair empty answer options instead of adding static choices", async () => {
    model.ask.mockResolvedValueOnce({ text: "Who should read this?", options: [] }).mockResolvedValueOnce(audience);
    expect(await generateClarificationQuestion({ brief: "GitHub vs GitLab", answers: [], goal: "Clarify the audience", purpose: "audience" })).toEqual({ ...audience, purpose: "audience", generatedBy: "llm" });
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate options and never silently replaces them with a generic list", async () => {
    model.ask.mockResolvedValue({ text: "Who should read this?", options: ["Developers", "developers"] });
    await expect(generateClarificationQuestion({ brief: "GitHub vs GitLab", answers: [], goal: "Clarify audience" })).rejects.toThrow("distinct");
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  it("requires an LLM to author a missing question", async () => {
    model.configured = false;
    await expect(requiredCreativeContextQuestion("Create a comparison poster.", [])).rejects.toThrow("AI provider is required");
    expect(model.ask).not.toHaveBeenCalled();
  });

  it("can proceed offline when both fields are already explicit", async () => {
    model.configured = false;
    expect(await requiredCreativeContextQuestion("Create a poster for parents in a reassuring tone.", [])).toBeNull();
  });

  it("preserves strict provider failures", async () => {
    model.fallback = false;
    model.ask.mockRejectedValue(new Error("Provider unavailable"));
    await expect(requiredCreativeContextQuestion("Create a poster.", [])).rejects.toThrow("Provider unavailable");
  });
  it('uses compatible saved defaults without inventing user answers',async()=>{
    const brand={audience:'Software developers',voice:'Clear and collaborative'},record=vi.fn(),answers:WorkflowAnswer[]=[];
    model.ask.mockResolvedValue({audience:brand.audience,tone:brand.voice,audienceDefaultFits:true,toneDefaultFits:true,reason:'A review teaching carousel fits the saved developer audience and collaborative voice.',question:null});
    expect(await requiredCreativeContextQuestion('Create a carousel about constructive code review.',answers,brand,record)).toBeNull();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({defaultsUsed:['audience','tone'],missing:null}));expect(answers).toEqual([]);
  });
  it('asks when the intended audience is ambiguous and the saved default conflicts',async()=>{
    model.ask.mockResolvedValue({audience:null,tone:'Clear and collaborative',audienceDefaultFits:false,toneDefaultFits:true,reason:'The recruitment brief may target experienced hires rather than the saved student audience.',question:audience});
    const question=await requiredCreativeContextQuestion('Create a senior engineering recruitment poster.',[],{audience:'School students',voice:'Clear and collaborative'});
    expect(question).toMatchObject({...audience,purpose:'audience'});
  });
  it('checks tone independently when the audience default fits',async()=>{
    model.ask.mockResolvedValue({audience:'Employees',tone:null,audienceDefaultFits:true,toneDefaultFits:false,reason:'A bereavement notice conflicts with the playful saved voice.',question:tone});
    expect(await requiredCreativeContextQuestion('Create a workplace bereavement notice.',[],{audience:'Employees',voice:'Playful and humorous'})).toMatchObject({...tone,purpose:'tone'});
  });
  it('follows explicit user overrides without asking because they differ from defaults',async()=>{
    model.ask.mockResolvedValue({audience:'parents',tone:'reassuring',audienceDefaultFits:false,toneDefaultFits:false,question:null});
    expect(await requiredCreativeContextQuestion('Create a poster for parents in a reassuring tone.',[],{audience:'Students',voice:'Playful'})).toBeNull();
  });
  it.each([false,undefined])('rejects a default quote without positive compatibility evidence (%s)',async fits=>{
    model.ask.mockResolvedValueOnce({audience:'Students',tone:'friendly',audienceDefaultFits:fits,question:null}).mockResolvedValueOnce(audience);
    expect(await requiredCreativeContextQuestion('Create a friendly poster about hiring.',[],{audience:'Students',voice:'Friendly'})).toMatchObject({purpose:'audience'});
  });
  it('rejects invented replacements even when the model claims they are compatible defaults',async()=>{
    model.ask.mockResolvedValueOnce({audience:'Senior engineers',tone:'friendly',audienceDefaultFits:true,question:null}).mockResolvedValueOnce(audience);
    expect(await requiredCreativeContextQuestion('Create a friendly hiring poster.',[],{audience:'Students',voice:'Friendly'})).toMatchObject({purpose:'audience'});
  });
});
