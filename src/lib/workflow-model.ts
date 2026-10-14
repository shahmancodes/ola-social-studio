import { createGateway, generateText } from "ai";
import { z } from "zod";
import { withProviderFallback } from "./ai-provider";

export function workflowModelConfigured() { return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENROUTER_API_KEY); }

export async function askWorkflowModel<T extends z.ZodType>(schema: T, prompt: string, images: string[] = []): Promise<z.infer<T>> {
  const parse = (raw: string) => schema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()));
  const vercelModel = process.env.VERCEL_AI_MODEL || "openai/gpt-6-luna";
  const openrouterModel = process.env.OPENROUTER_MODEL || "qwen/qwen3.6-35b-a3b";
  const result = await withProviderFallback(
    async () => {
      const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY! });
      const content = [{ type: "text" as const, text: prompt }, ...images.map((image) => ({ type: "image" as const, image: Buffer.from(image.split(",")[1], "base64"), mediaType: "image/jpeg" as const }))];
      const answer = await generateText({ model: gateway(vercelModel), messages: [{ role: "user", content }], maxOutputTokens: 1800, abortSignal: AbortSignal.timeout(60_000) });
      return { value: parse(answer.text) };
    },
    async () => {
      const content = images.length ? [{ type: "text", text: prompt }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] : prompt;
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: images.length ? process.env.OPENROUTER_VISION_MODEL || openrouterModel : openrouterModel, messages: [{ role: "user", content }], response_format: { type: "json_object" } }), signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
      const data = await response.json();
      return { value: parse(String(data.choices?.[0]?.message?.content ?? "{}")) };
    },
    { vercel: vercelModel, openrouter: openrouterModel },
  );
  return result.value;
}
