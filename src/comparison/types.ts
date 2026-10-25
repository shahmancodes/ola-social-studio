import { z } from "zod";
import { BrandSchema } from "../lib/platform";

export const engines = ["canva-direct", "canva-agent", "ola"] as const;
export type Engine = typeof engines[number];
export const labels: Record<Engine, string> = { "canva-direct": "Canva Direct", "canva-agent": "AI + Canva", ola: "Ola" };
export const ModelSchema = z.object({ provider: z.enum(["vercel", "openrouter"]), model: z.string().trim().min(1).max(160) });
export const modes = ['canva', 'models', 'ola'] as const;
export type ComparisonMode = typeof modes[number];
export type Contender = { id: string; engine: Engine; label: string; model?: ModelConfig; companyId?: string };
export const InputSchema = z.object({
  mode: z.enum(modes).optional(), models: z.array(ModelSchema).min(2).max(5).optional(),
  companyIds: z.array(z.string().uuid()).min(2).max(10).optional(),
  brief: z.string().trim().min(3).max(5000), companyName: z.string().trim().min(1).max(120),
  companyId: z.string().optional(), brand: BrandSchema, format: z.enum(["story", "carousel", "poster"]),
  slideCount: z.number().int().min(3).max(9).default(6), model: ModelSchema,
  uploadMetadata: z.array(z.object({ name: z.string().max(200), category: z.enum(["logo", "wordmark", "artwork", "font"]), sourceUrl: z.string().url().optional(), rightsNote: z.string().max(1000).optional() })).max(16).optional(),
  assetIds: z.array(z.string().uuid()).max(16).default([]), fixture: z.boolean().default(false),
});
export type ModelConfig = z.infer<typeof ModelSchema>;
export type FrozenAsset = { id: string; name: string; mediaType: string; category: string; role: string; path: string; sha256: string; sourceUrl?: string; rightsNote?: string };
export type FrozenCompany = { companyId: string; companyName: string; brand: z.infer<typeof BrandSchema>; assets: FrozenAsset[]; olaRules?: import("./store").BrandRuleRevision };
export type SharedInput = Omit<z.infer<typeof InputSchema>, "assetIds" | "companyIds"> & { assets: FrozenAsset[]; companies?: FrozenCompany[]; olaRules?: import("./store").BrandRuleRevision };
export type PageArtifact = { file: string; width: number; height: number; label?: string };
export type Result = { sources?: string[]; renderEvidence?: unknown; pages: PageArtifact[]; initialPages?: PageArtifact[]; caption?: string; editUrl?: string; quality?: unknown };
export type Status = "queued" | "running" | "awaiting-input" | "complete" | "needs-review" | "failed" | "blocked" | "interrupted";
export type Attempt = {
  id: string; caseId: string; contenderId?: string; engine: Engine; version: number; status: Status; stage: string;
  createdAt: string; startedAt?: string; finishedAt?: string; activeMs: number;
  brandRules?: import("./store").BrandRuleRevision;
  usage?: import("../lib/ai-usage").UsageSummary; model?: ModelConfig; fingerprint: string; inputHash: string; projectId?: string;
  limitations?: string[]; result?: Result; question?: { text: string; options: string[] }; error?: string;
  state: Record<string, unknown>; events: Array<{ at: string; kind: string; data: unknown }>;
};
export type Comparison = { id: string; createdAt: string; input: SharedInput; inputHash: string; attempts: Attempt[] };
export function sourceBrief(input:SharedInput){
  const dimensions = input.format === "poster" ? "one A4 portrait poster, exactly one 1240 × 1754 pixel page (digital proof)" : input.format === "story" ? "one static 1080 × 1920 Instagram Story" : `${input.slideCount} ordered 1080 × 1350 Instagram carousel pages`;
  return `${input.brief}\n\nRequired format: ${dimensions}.`;
}
export function sharedBrief(input: SharedInput) {
  return `${sourceBrief(input)}\nCompany: ${input.companyName}\nBrand context: ${JSON.stringify(input.brand)}\nSelected assets: ${JSON.stringify(input.assets.map(({ id, name, category, role, sha256 }) => ({ id, name, category, role, sha256 })))}\nUse the supplied assets where relevant. Assets categorized reference are style evidence only; never place them in final artwork. Do not invent private business facts.`;
}

export { comparisonContenders, contenderId } from "./contenders";
