import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMembership } from "@/lib/platform-auth";
import { ContentTypeSchema, createProjectRecord, listCompanyProjects } from "@/lib/platform";
import { enqueue } from "@/lib/platform-db";
import { initializeSpecialistWorkflow } from "@/lib/workflow-state";
import { comingSoonError, isActiveFormat } from "@/lib/format-availability";

const Input = z.object({ companyId: z.string().uuid(), type: ContentTypeSchema, brief: z.string().min(3).max(5000), instructions: z.string().max(3000).default(""), slideCount: z.union([z.literal("auto"), z.number().int().min(3).max(20)]).default("auto"), referenceNotes: z.string().max(5000).default("") });
export async function POST(request: Request) {
  try {
    const input = Input.parse(await request.json()); const { user } = await requireMembership(input.companyId);
    if (!isActiveFormat(input.type)) return NextResponse.json(comingSoonError(input.type), { status: 422 });
    if (input.type === "carousel" && typeof input.slideCount === "number" && input.slideCount > 9) throw new Error("Carousels support 3–9 slides.");
    const projectId = createProjectRecord({ companyId: input.companyId, creatorId: user.id, contentType: input.type, brief: input.brief, status: "queued", artifact: { instructions: input.instructions, slideCount: input.slideCount, referenceNotes: input.referenceNotes } });
    initializeSpecialistWorkflow(projectId, input.type, input.brief, { type: input.type, explicit: true });
    enqueue(projectId, "generate-simple");
    return NextResponse.json({ id: projectId }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start project." }, { status: 400 }); }
}
export async function GET(request: Request) {
  try { const companyId = new URL(request.url).searchParams.get("companyId") ?? ""; await requireMembership(companyId); return NextResponse.json({ projects: listCompanyProjects(companyId) }); }
  catch { return NextResponse.json({ error: "Access denied." }, { status: 403 }); }
}
