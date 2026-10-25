import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createIntakeRequest } from "./intake";
import { companyStorageDir, storeProjectReference } from "./platform";
import { db, enqueue, now } from "./platform-db";
import { guidedBrief, REFERENCE_LIMIT, REFERENCE_MAX_BYTES, type CreativeBrief } from "./creative-brief";

export async function prepareBriefReferences(files: File[]) {
  if (files.length > REFERENCE_LIMIT) throw new Error(`Choose up to ${REFERENCE_LIMIT} reference images.`);
  const prepared: Array<{ name: string; bytes: Buffer }> = [];
  for (const file of files) {
    if (!file.type.startsWith("image/") || !file.size || file.size > REFERENCE_MAX_BYTES) throw new Error("Choose reference images under 10 MB each.");
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000) throw new Error("Reference images must be at most 6,000 × 6,000 pixels.");
    prepared.push({ name: file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.[a-z0-9]+$/i, "") + ".png", bytes: await image.rotate().png().toBuffer() });
  }
  return prepared;
}

/** References must be durable before a worker can pick up the new request. */
export async function createCreativeRequest(input: CreativeBrief, creatorId: string, references: Awaited<ReturnType<typeof prepareBriefReferences>>) {
  const projectId = createIntakeRequest(input.companyId, creatorId, guidedBrief(input), { deferQueue: true, sourceBrief: input.brief, creativeChoices: { format: input.format, slideCount: input.format === "carousel" ? input.slideCount : undefined, audience: input.audience, tone: input.tone, references: references.map(reference => reference.name) } });
  try {
    for (const reference of references) await storeProjectReference(projectId, reference.name, reference.bytes, "image/png");
    const database = db();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("UPDATE projects SET status='queued',updated_at=? WHERE id=?").run(now(), projectId);
      enqueue(projectId, "intake-route");
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    return projectId;
  } catch (error) {
    // This request has never been queued. Remove only its incomplete upload and rows.
    const database = db();
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const table of ["project_references", "workflow_events", "workflow_state"]) database.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(projectId);
      database.prepare("DELETE FROM projects WHERE id=?").run(projectId);
      database.exec("COMMIT");
    } catch (cleanupError) { database.exec("ROLLBACK"); throw cleanupError; }
    await fs.rm(path.join(companyStorageDir(input.companyId), "projects", projectId), { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
