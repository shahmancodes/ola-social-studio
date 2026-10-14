import { z } from "zod";
import { askWorkflowModel, workflowModelConfigured } from "./workflow-model";

export const InternetResearchPlanSchema = z.object({
  needed: z.boolean(),
  focus: z.string().max(500),
  reason: z.string().max(300),
});
export type InternetResearchPlan = z.infer<typeof InternetResearchPlanSchema>;

export function fallbackInternetResearchPlan(type: string, brief: string): InternetResearchPlan {
  const positive = brief.split(/[.;\n]/).filter((clause) => !/\b(no|avoid|without|do not|don't|unverified|unsupported)\b/i.test(clause)).join(" ");
  const factual = /\b(202\d|statistics?|data|research|deadlines?|polic(?:y|ies)|laws?|prices?|rates?|evidence|stud(?:y|ies)|sources?|health|financial|scientific|news|updates?|cite|citations?|features?|capabilities|products?|services?|platforms?|offerings?)\b/i.test(positive);
  const physicalDesign = type === "design" && /\b(print|physical|dimensions?|sizing|cheques?|checks?|certificates?|posters?|flyers?|banners?)\b/i.test(positive);
  const needed = factual || physicalDesign;
  return {
    needed,
    focus: needed ? `Verify the public facts, product details, or format references needed for this ${type}: ${brief.slice(0, 350)}` : "",
    reason: needed ? "The brief may depend on externally verifiable information." : "The brief can be produced from the supplied details and company brand.",
  };
}

export async function planInternetResearch(input: { type: string; brief: string; brand: unknown; answers?: unknown; scope?: "facts" | "design" | "carousel" }): Promise<InternetResearchPlan> {
  const fallback = fallbackInternetResearchPlan(input.type, input.brief);
  if (!workflowModelConfigured()) return fallback;
  const scope = input.scope === "design" ? "Decide whether physical dimensions or factual format requirements need live verification. A separate coordinator decision handles visual inspiration." : input.scope === "carousel" ? "Decide whether public facts or rights-cleared internet assets would materially improve this carousel. A separate coordinator decision handles visual inspiration." : "Decide whether the copy needs verifiable public facts, product details, current information, or cited evidence. A separate coordinator decision handles visual inspiration.";
  const prompt = `You are Ola's master coordinator. Decide whether a specialist needs an internet research agent BEFORE creating this ${input.type}. Return ONLY JSON {"needed":boolean,"focus":"specific facts or references to verify, or empty string","reason":"short reason"}. ${scope} A named product's features require checking official first-party sources even when the brief does not say "current". Do not search for purely subjective copy, fictional concepts, or facts already supplied in reliable source material. If public research could answer a question, send the researcher instead of asking the user for a source. Never invent facts or URLs. Brief: ${JSON.stringify(input.brief)}. Brand: ${JSON.stringify(input.brand).slice(0, 4500)}. Prior answers: ${JSON.stringify(input.answers ?? []).slice(0, 2500)}.`;
  return askWorkflowModel(InternetResearchPlanSchema, prompt).catch(() => fallback);
}
