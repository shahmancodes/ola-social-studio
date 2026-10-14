import { NextResponse } from "next/server";
import { requireUser } from "@/lib/platform-auth";
import { openRouterConfigured, vercelConfigured } from "@/lib/ai-provider";

export const runtime = "nodejs";

export async function GET() {
  await requireUser();
  return NextResponse.json({
    primary: { provider: "vercel", configured: vercelConfigured(), model: process.env.VERCEL_AI_MODEL || "openai/gpt-6-luna" },
    openRouter: { configured: openRouterConfigured(), model: process.env.OPENROUTER_MODEL || "qwen/qwen3.6-35b-a3b" },
  });
}
