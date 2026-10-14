import { createGateway, generateText, stepCountIs } from "ai";
import { OpenRouter, callModel, hasToolCall, serverTool, stepCountIs as openRouterStepCountIs, tool } from "@openrouter/agent";
import { z } from "zod";
import { askWorkflowModel, workflowModelConfigured } from "./workflow-model";

export const VisualReferencePlanSchema = z.object({ needed: z.boolean(), focus: z.string().max(500), reason: z.string().max(300) });
export type VisualReferencePlan = z.infer<typeof VisualReferencePlanSchema>;
const Reference = z.object({ title: z.string().min(1), url: z.string().url(), observedPattern: z.string().min(1), usage: z.literal("reference-only") });
export const VisualReferenceResearchSchema = z.object({ summary: z.string().min(1), layoutPatterns: z.array(z.string()).min(1).max(8), toneAndPacing: z.array(z.string()).max(8), avoid: z.array(z.string()).max(8), references: z.array(Reference).min(1).max(8) });
export type VisualReferenceResearch = z.infer<typeof VisualReferenceResearchSchema>;

export function fallbackVisualReferencePlan(type: string, brief: string, localReferences: string[] = []): VisualReferencePlan {
  const positive = brief.split(/[.;\n]/).filter((clause) => !/\b(no|avoid|without|do not|don't)\b/i.test(clause)).join(" ");
  const requested = /\b(visual references?|examples?|inspiration|trends?|current style|look and feel|moodboard|layouts?|design direction)\b/i.test(positive);
  const unfamiliar = type === "design" && /\b(cheques?|checks?|certificates?|posters?|flyers?|banners?|packaging|signage)\b/i.test(positive);
  const needed = requested || unfamiliar && localReferences.length === 0;
  return { needed, focus: needed ? `Find credible visual examples and transferable composition patterns for this ${type}: ${brief.slice(0, 350)}` : "", reason: needed ? "The brief would benefit from visual examples beyond the supplied brand references." : "The supplied brief and brand references provide enough visual direction." };
}

export async function planVisualReferences(input: { type: string; brief: string; brand: unknown; answers?: unknown; localReferences?: string[] }): Promise<VisualReferencePlan> {
  const fallback = fallbackVisualReferencePlan(input.type, input.brief, input.localReferences);
  if (!workflowModelConfigured()) return fallback;
  const prompt = `You are Ola's master coordinator. Decide whether a separate live visual-reference researcher would materially improve this ${input.type}. Return ONLY JSON {"needed":boolean,"focus":"specific visual examples or patterns to investigate, or empty string","reason":"short reason"}. Consider the audience, format, unfamiliar design conventions, requested visual style, current platform patterns, and the available local brand references. Visual research is independent of factual research. Skip it when the supplied references and established brand system are sufficient. If needed, the researcher will inspect public examples for broad layout, tone and pacing cues; it will not copy images or use examples as factual evidence. Brief: ${JSON.stringify(input.brief)}. Brand: ${JSON.stringify(input.brand).slice(0, 4500)}. Prior answers: ${JSON.stringify(input.answers ?? []).slice(0, 2500)}. Local references: ${JSON.stringify(input.localReferences ?? []).slice(0, 1500)}.`;
  return askWorkflowModel(VisualReferencePlanSchema, prompt).catch(() => fallback);
}

export async function researchVisualReferences(input: { type: string; brief: string; focus: string; brand: unknown }): Promise<VisualReferenceResearch> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENROUTER_API_KEY) throw new Error("This visual brief needs a research-capable AI provider.");
  const prompt = `Research live visual references for a ${input.type}. Brief: ${input.brief}. Focus: ${input.focus}. Brand: ${JSON.stringify(input.brand).slice(0, 3000)}. Inspect real public pages and give exact URLs only. Extract transferable layout, visual hierarchy, tone and pacing patterns. Do not copy third-party designs or claim these references prove factual statements. If no suitable pages can be verified, report that clearly rather than inventing links.`;
  if (process.env.AI_GATEWAY_API_KEY) {
    try {
      const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
      const result = await generateText({ model: gateway(process.env.VERCEL_AI_MODEL || "openai/gpt-6-luna"), tools: { webSearch: gateway.tools.perplexitySearch({ maxResults: 8, maxTokensPerPage: 1100, maxTokens: 6500, country: "HK", searchLanguageFilter: ["en"] }) }, stopWhen: stepCountIs(6), maxOutputTokens: 2600, abortSignal: AbortSignal.timeout(60_000), prompt: `${prompt} Use webSearch, then return ONLY JSON {"summary":"...","layoutPatterns":["..."],"toneAndPacing":["..."],"avoid":["..."],"references":[{"title":"...","url":"https://exact-page-url","observedPattern":"...","usage":"reference-only"}]}. Include at least one verified reference.` });
      if (!result.steps.some((step) => step.toolCalls.some((call) => call.toolName === "webSearch"))) throw new Error("Visual reference agent did not use web search.");
      return VisualReferenceResearchSchema.parse(JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
    } catch (error) { if (!process.env.OPENROUTER_API_KEY) throw error; }
  }
  let submitted: VisualReferenceResearch | undefined;
  const submit = tool({ name: "submit_visual_references", description: "Submit inspected visual references and transferable patterns with exact source URLs.", inputSchema: VisualReferenceResearchSchema, outputSchema: z.object({ accepted: z.boolean() }), execute: async (value) => { submitted = VisualReferenceResearchSchema.parse(value); return { accepted: true }; } });
  const result = callModel(new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }), { model: process.env.OPENROUTER_MODEL || "qwen/qwen3.6-35b-a3b", input: `${prompt}\nUse web search, inspect pages, then call submit_visual_references.`, tools: [serverTool({ type: "openrouter:web_search", parameters: { maxResults: 8 } }), submit] as const, stopWhen: [hasToolCall("submit_visual_references"), openRouterStepCountIs(8)], doomLoop: true, signal: AbortSignal.timeout(60_000), toolTimeoutMs: 20_000 });
  await result.getText();
  if (!submitted) throw new Error("Visual reference research did not return verified references.");
  return submitted;
}
