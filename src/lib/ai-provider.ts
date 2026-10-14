export const vercelConfigured = () => Boolean(process.env.AI_GATEWAY_API_KEY);
export const openRouterConfigured = () => Boolean(process.env.OPENROUTER_API_KEY);

export type AiProviderName = "vercel" | "openrouter";

export type ProviderAgentResult<T> = {
  value: T;
  usage?: unknown;
  provider: AiProviderName;
  model: string;
  fallback?: {
    from: "vercel";
    to: "openrouter";
    reason: string;
  };
};

function conciseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

export async function withProviderFallback<T>(
  vercelTask: () => Promise<{ value: T; usage?: unknown }>,
  openRouterTask: () => Promise<{ value: T; usage?: unknown }>,
  models: { vercel: string; openrouter: string },
  signal?: AbortSignal,
): Promise<ProviderAgentResult<T>> {
  signal?.throwIfAborted();
  if (vercelConfigured()) {
    try {
      const result = await vercelTask();
      return { ...result, provider: "vercel", model: models.vercel };
    } catch (vercelError) {
      signal?.throwIfAborted();
      if (!openRouterConfigured()) throw vercelError;
      try {
        const result = await openRouterTask();
        return {
          ...result,
          provider: "openrouter",
          model: models.openrouter,
          fallback: { from: "vercel", to: "openrouter", reason: conciseError(vercelError) },
        };
      } catch (openRouterError) {
        throw new AggregateError([vercelError, openRouterError], `Vercel AI Gateway failed (${conciseError(vercelError)}), then OpenRouter fallback failed (${conciseError(openRouterError)}).`);
      }
    }
  }
  if (openRouterConfigured()) {
    const result = await openRouterTask();
    return {
      ...result,
      provider: "openrouter",
      model: models.openrouter,
    };
  }
  throw new Error("No AI provider is configured. Add AI_GATEWAY_API_KEY or OPENROUTER_API_KEY.");
}

export function agentConfigured() {
  return vercelConfigured() || openRouterConfigured();
}
