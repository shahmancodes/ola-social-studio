import { after, NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { getBrand, latestBrandJob, queueBrandAnalysis } from "@/lib/platform";
import { runBrandJob } from "@/lib/brand-analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireMembership(id);
    return NextResponse.json({ brand: getBrand(id), job: latestBrandJob(id) ?? null });
  } catch { return NextResponse.json({ error: "Access denied." }, { status: 403 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireMembership(id, "admin");
    const body = await request.json();
    const website = String(body.website ?? "").trim();
    if (website) {
      const url = new URL(website);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Enter an HTTP or HTTPS website URL.");
    }
    const existing = latestBrandJob(id);
    if (existing && ["queued", "running"].includes(existing.status)) {
      if (existing.status === "queued") after(() => runBrandJob(existing.id));
      return NextResponse.json({ job: existing });
    }
    const jobId = queueBrandAnalysis(id, website);
    after(() => runBrandJob(jobId));
    return NextResponse.json({ job: { id: jobId, status: "queued" } }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start analysis." }, { status: 400 }); }
}
