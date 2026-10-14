import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/platform-auth";
import { answerIntake, retryIntake } from "@/lib/intake";
import { answerDesignQuestion } from "@/lib/freeform-design";
import { answerSpecialistQuestion } from "@/lib/content-specialists";
import { projectRow } from "@/lib/platform-db";
import { requestSnapshot } from "@/lib/request-workspace";

export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireProjectAccess(id);
    return NextResponse.json(await requestSnapshot(id), { headers: { "cache-control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Request not found." }, { status: 404 }); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireProjectAccess(id);
    const input = z.union([z.object({ answer: z.string().trim().min(1).max(2000) }), z.object({ action: z.literal("retry") })]).parse(await request.json());
    if ("answer" in input) {
      const row = projectRow(id); if (!row) throw new Error("Request not found.");
      if (row.content_type === "intake") answerIntake(id, input.answer);
      else if (row.content_type === "design") answerDesignQuestion(id, input.answer);
      else answerSpecialistQuestion(id, input.answer);
    } else retryIntake(id);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save answer." }, { status: 400 }); }
}
