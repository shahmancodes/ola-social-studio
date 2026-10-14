import { afterEach, describe, expect, it, vi } from "vitest";
import { withProviderFallback } from "./ai-provider";

const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
});

describe("AI provider fallback", () => {
  it("uses Vercel when the primary provider succeeds", async () => {
    process.env.AI_GATEWAY_API_KEY = "vercel-test";
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    const fallback = vi.fn();
    const result = await withProviderFallback(
      async () => ({ value: "primary" }),
      fallback,
      { vercel: "openai/gpt-5.2", openrouter: "qwen/test" },
    );
    expect(result).toMatchObject({ value: "primary", provider: "vercel", model: "openai/gpt-5.2" });
    expect(result.fallback).toBeUndefined();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("uses and reports OpenRouter when Vercel fails", async () => {
    process.env.AI_GATEWAY_API_KEY = "vercel-test";
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    const result = await withProviderFallback(
      async () => { throw new Error("primary unavailable"); },
      async () => ({ value: "fallback" }),
      { vercel: "openai/gpt-5.2", openrouter: "qwen/test" },
    );
    expect(result).toMatchObject({
      value: "fallback",
      provider: "openrouter",
      model: "qwen/test",
      fallback: { from: "vercel", to: "openrouter", reason: "primary unavailable" },
    });
  });

  it("uses OpenRouter directly without reporting a fallback when Vercel is not configured", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.OPENROUTER_API_KEY = "openrouter-test";
    const primary = vi.fn();
    const result = await withProviderFallback(
      primary,
      async () => ({ value: "direct" }),
      { vercel: "openai/gpt-5.2", openrouter: "qwen/test" },
    );
    expect(result).toMatchObject({ value: "direct", provider: "openrouter", model: "qwen/test" });
    expect(result.fallback).toBeUndefined();
    expect(primary).not.toHaveBeenCalled();
  });
});
