import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { answerDesignQuestion } from "@/lib/freeform-design";
import { answerSpecialistQuestion } from "@/lib/content-specialists";
import { projectRow } from "@/lib/platform-db";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); const body = await request.json(); if (projectRow(id)?.content_type === "design") answerDesignQuestion(id, String(body.answer ?? "")); else answerSpecialistQuestion(id, String(body.answer ?? "")); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save answer." }, { status: 400 }); }
}
