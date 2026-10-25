import { z } from 'zod';
import type { ModelConfig } from './types';

export type ModelOption = { id: string; name: string };
const endpoints = {
  vercel: 'https://ai-gateway.vercel.sh/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};
const catalogSchema = z.object({ data: z.array(z.object({
  id: z.string().min(1), name: z.string().optional(),
  modalities: z.object({ input: z.array(z.string()), output: z.array(z.string()) }).optional(),
  architecture: z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) }).optional(),
})) });
const cache = new Map<string, { until: number; models: ModelOption[] }>();

export async function modelCatalog(provider: ModelConfig['provider']): Promise<ModelOption[]> {
  const saved = cache.get(provider);
  if (saved && saved.until > Date.now()) return saved.models;
  // Public catalogs need no credentials. The inspection pass requires image input.
  const response = await fetch(endpoints[provider], { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!response.ok) throw new Error('Model catalog is unavailable. Your configured model is still available.');
  const { data } = catalogSchema.parse(await response.json());
  const models = data.filter(model => {
    const input = model.modalities?.input ?? model.architecture?.input_modalities ?? [];
    const output = model.modalities?.output ?? model.architecture?.output_modalities ?? [];
    return input.includes('image') && input.includes('text') && output.includes('text');
  }).map(({ id, name }) => ({ id, name: name || id })).sort((a, b) => a.id.localeCompare(b.id));
  cache.set(provider, { until: Date.now() + 10 * 60_000, models });
  return models;
}
