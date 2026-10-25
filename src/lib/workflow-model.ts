import { generateText, aiFetch } from "./ai-usage";
import { modelFor, providerEnabled, fallbackAllowed } from "./ai-execution";
import { createGateway } from "ai";
import { z } from "zod";
import { withProviderFallback } from "./ai-provider";

export function workflowModelConfigured() { return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENROUTER_API_KEY); }

export async function askWorkflowModel<T extends z.ZodType>(schema: T, prompt: string, images: string[] = [], options: { maxOutputTokens?: number } = {}): Promise<z.infer<T>> {
  const parse = (raw: string) => schema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()));
  const vercelModel = modelFor("vercel");
  const openrouterModel = modelFor("openrouter");
  const result = await withProviderFallback(
    async () => {
      const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY! });
      const content = [{ type: "text" as const, text: prompt }, ...images.map((image) => ({ type: "image" as const, image: Buffer.from(image.split(",")[1], "base64"), mediaType: "image/jpeg" as const }))];
      const answer = await generateText({ model: gateway(vercelModel), messages: [{ role: "user", content }], maxOutputTokens: Math.min(6000, Math.max(500, options.maxOutputTokens ?? 1800)), abortSignal: AbortSignal.timeout(60_000) });
      return { value: parse(answer.text) };
    },
    async () => {
      const content = images.length ? [{ type: "text", text: prompt }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] : prompt;
      const response = await aiFetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: images.length ? modelFor("openrouter", true) : openrouterModel, messages: [{ role: "user", content }], response_format: { type: "json_object" }, ...(options.maxOutputTokens ? { max_tokens: Math.min(6000, Math.max(500, options.maxOutputTokens)) } : {}) }), signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
      const data = await response.json();
      return { value: parse(String(data.choices?.[0]?.message?.content ?? "{}")) };
    },
    { vercel: vercelModel, openrouter: openrouterModel },
  );
  return result.value;
}
