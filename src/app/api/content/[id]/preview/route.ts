import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { SimpleArtifactSchema } from "@/lib/simple-content";
import { DesignSpecSchema } from "@/lib/freeform-design";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireProjectAccess(id); const row = projectRow(id); if (!row?.artifact_json) throw new Error("Not found."); const artifact = row.content_type === "design" ? DesignSpecSchema.parse(JSON.parse(row.artifact_json)) : SimpleArtifactSchema.parse(JSON.parse(row.artifact_json)); const index = Number(new URL(request.url).searchParams.get("slide") ?? "1") - 1; const file = artifact.type === "post" || artifact.type === "story" || artifact.type === "design" ? artifact.imagePath : artifact.type === "carousel" && Number.isInteger(index) ? artifact.imagePaths[index] : artifact.type === "presentation" && Number.isInteger(index) ? artifact.previewPaths?.[index] : undefined; if (!file) throw new Error("Not found."); return new Response(new Uint8Array(await fs.readFile(file)), { headers: { "content-type": "image/png", "cache-control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Not found." }, { status: 404 }); }
}
