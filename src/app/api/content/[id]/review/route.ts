import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { db, enqueue, now, projectRow } from "@/lib/platform-db";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireProjectAccess(id);
    const row = projectRow(id); if (!row?.artifact_json || row.status === "stopped") throw new Error("Project cannot be reviewed.");
    const artifact = JSON.parse(row.artifact_json);
    if (artifact.designVersion !== 2) throw new Error("Review is only available for current projects.");
    db().prepare("UPDATE projects SET status='qa',updated_at=? WHERE id=?").run(now(), id);
    enqueue(id, "review-simple");
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start review." }, { status: 400 }); }
}
