import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createGateway, generateText, stepCountIs } from "ai";
import sharp from "sharp";
import { z } from "zod";
import { OpenRouter, callModel, hasToolCall, serverTool, stepCountIs as openRouterStepCountIs, tool } from "@openrouter/agent";
import { companyStorageDir, type Brand } from "./platform";
import { fetchImage } from "./internet-assets";

export const ArtworkSchema = z.object({
  title: z.string(), sourcePageUrl: z.string().url(), assetUrl: z.string().url(), rights: z.string(), attribution: z.string(), reason: z.string(), use: z.boolean(), localPath: z.string().optional(), status: z.enum(["downloaded", "failed", "skipped"]), error: z.string().optional(),
});
export type Artwork = z.infer<typeof ArtworkSchema>;

const CandidateSchema = ArtworkSchema.omit({ status: true, localPath: true, error: true });

async function openRouterArtwork(prompt: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];
  let submitted: z.infer<typeof CandidateSchema>[] | undefined;
  const submit = tool({ name: "submit_artwork", description: "Submit up to two sourced optional assets, or an empty array.", inputSchema: z.object({ assets: z.array(CandidateSchema).max(2) }), outputSchema: z.object({ accepted: z.boolean() }), execute: async ({ assets }) => { submitted = assets; return { accepted: true }; } });
  const result = callModel(new OpenRouter({ apiKey }), { model: process.env.OPENROUTER_MODEL || "qwen/qwen3.6-35b-a3b", input: `${prompt}\nUse web search, then call submit_artwork.`, tools: [serverTool({ type: "openrouter:web_search", parameters: { maxResults: 8 } }), submit] as const, stopWhen: [hasToolCall("submit_artwork"), openRouterStepCountIs(8)], doomLoop: true });
  await result.getText();
  return submitted ?? [];
}

export async function researchArtwork(input: { projectId: string; companyId: string; brief: string; brand: Brand; type: string }): Promise<Artwork[]> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENROUTER_API_KEY) return [];
  try {
    const prompt = `Search the web for up to 2 optional artwork assets for a ${input.type} about ${input.brief}. Brand: ${JSON.stringify(input.brand)}. Prefer original 2D art, clipart, vector icons, diagrams, emoji, stickers or simple graphics; real-life photography is usually a poor fit. Inspect relevant options until you can justify them. A collection page is not a direct asset URL. If none adds value, return an empty assets array. Record rights honestly; do not assume public means reusable.`;
    let candidates: z.infer<typeof CandidateSchema>[];
    try {
      if (!process.env.AI_GATEWAY_API_KEY) throw new Error("Vercel is not configured.");
      const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
      const result = await generateText({
      model: gateway(process.env.VERCEL_AI_MODEL || "openai/gpt-6-luna"),
      tools: { webSearch: gateway.tools.perplexitySearch({ maxResults: 6, maxTokensPerPage: 900, maxTokens: 5000, country: "HK", searchLanguageFilter: ["en"] }) },
      stopWhen: stepCountIs(4), maxOutputTokens: 1800,
      prompt: `${prompt} Return ONLY JSON {"assets":[{"title":"...","sourcePageUrl":"https://...","assetUrl":"https://... direct downloadable image","rights":"specific licence/rights evidence or unverified","attribution":"...","reason":"why it improves comprehension or composition","use":true}]}.`,
      });
      const generated = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      candidates = z.array(CandidateSchema).max(2).parse(generated.assets ?? []);
    } catch (error) {
      if (!process.env.OPENROUTER_API_KEY) throw error;
      candidates = await openRouterArtwork(prompt);
    }
    const output: Artwork[] = [];
    for (const candidate of candidates) {
      if (!candidate.use) { output.push({ ...candidate, status: "skipped" }); continue; }
      try {
        const bytes = await fetchImage(candidate.assetUrl);
        const png = await sharp(bytes, { limitInputPixels: 30_000_000 }).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        const directory = path.join(companyStorageDir(input.companyId), "projects", input.projectId, "artwork");
        await fs.mkdir(directory, { recursive: true });
        const file = path.join(directory, `${crypto.randomUUID()}.png`);
        await fs.writeFile(file, png, { flag: "wx" });
        output.push({ ...candidate, localPath: file, status: "downloaded" });
      } catch (error) { output.push({ ...candidate, status: "failed", error: error instanceof Error ? error.message : String(error) }); }
    }
    return output;
  } catch (error) { process.stderr.write(`Artwork research skipped: ${String(error)}\n`); return []; }
}
