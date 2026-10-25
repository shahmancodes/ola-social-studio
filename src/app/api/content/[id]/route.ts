import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { db, enqueue, projectRow, now } from "@/lib/platform-db";
import { saveSimpleArtifact } from "@/lib/simple-content";
import { saveDesignSpec } from "@/lib/freeform-design";
import { comingSoonError, isActiveFormat } from "@/lib/format-availability";
export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); const row = projectRow(id); return NextResponse.json({ project: row, artifact: row?.artifact_json ? JSON.parse(row.artifact_json) : null }); }
  catch { return NextResponse.json({ error: "Project not found." }, { status: 404 }); }
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); const body = await request.json(); const currentType = projectRow(id)?.content_type; if (body.artifact?.type && body.artifact.type !== currentType && !isActiveFormat(body.artifact.type)) return NextResponse.json(comingSoonError(body.artifact.type), { status: 422 }); const design = currentType === "design"; const modern = body.artifact?.designVersion === 2; const manualCanvas = Boolean(body.artifact?.editorAppearance?.freeform || body.artifact?.slides?.some((p: { editorAppearance?: { freeform?: unknown } }) => p.editorAppearance?.freeform)); const project = design ? await saveDesignSpec(id, body.artifact, Number(body.version), "qa") : await saveSimpleArtifact(id, body.artifact, Number(body.version), modern && !manualCanvas ? "qa" : "complete"); if (design || modern && !manualCanvas) enqueue(id, design ? "review-design" : "review-simple"); return NextResponse.json({ project }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save." }, { status: 400 }); }
}
export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); db().prepare("UPDATE projects SET status='stopped',updated_at=? WHERE id=?").run(now(), id); db().prepare("UPDATE jobs SET status='cancelled',updated_at=? WHERE project_id=? AND status='queued'").run(now(), id); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Access denied." }, { status: 403 }); }
}
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); const row = projectRow(id); if (!row || row.status !== "failed") throw new Error("Only a failed project can be retried."); db().prepare("UPDATE projects SET status='queued',updated_at=? WHERE id=?").run(now(), id); const designIntake = row.content_type === "design" ? JSON.parse(row.artifact_json ?? "{}") : null; enqueue(id, row.content_type === "design" ? (designIntake.phase === "intake" && designIntake.size ? "design-generate" : "design-clarify") : "generate-simple"); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not retry." }, { status: 400 }); }
}
