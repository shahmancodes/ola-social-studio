import { activateSpecialist } from "./intake";
import { db, enqueue, now, projectRow } from "./platform-db";
import { recordWorkflowEvent, saveWorkflowState, workflowState } from "./workflow-state";
import { isActiveFormat } from "./format-availability";

export type RevisionFormat = "post" | "story" | "article" | "carousel" | "presentation" | "design";

export async function queueWorkflowRevision(projectId: string, request: string, format: RevisionFormat | null) {
  const row = projectRow(projectId); if (!row || row.status === "stopped") throw new Error("This project cannot be revised.");
  const target = format ?? row.content_type as RevisionFormat;
  if (format && !isActiveFormat(format)) throw new Error(`${format} is Coming Soon. Choose an Instagram Story or carousel.`);
  const redirect = `/content/${projectId}`;
  const previousArtifact = row.artifact_json;
  if (previousArtifact) db().prepare("INSERT OR IGNORE INTO workflow_artifact_versions(project_id,version,artifact_json,created_at) VALUES(?,?,?,?)")
    .run(projectId, row.version, previousArtifact, now());
  recordWorkflowEvent(projectId, "agent", "revision", "planning", `Rebuilding as ${target}: ${request.slice(0, 350)}`, { request, from: row.content_type, to: target, previousVersion: row.version });
  const state = workflowState(projectId);
  if (state) saveWorkflowState({ ...state, phase: "working", question: null, specialist: target });
  if (target !== row.content_type) {
    const brief = `Create a ${target}. ${request}\nOriginal brief: ${row.brief}`.slice(0, 5000);
    await activateSpecialist(projectId, target, brief);
    return redirect;
  }
  if (target === "design") {
    const prior = JSON.parse(row.artifact_json ?? "{}");
    if (!prior.size) throw new Error("This design has no size to rebuild from.");
    const intake = { phase: "intake", instructions: request, referenceNotes: `Previous design: ${JSON.stringify(prior.elements ?? []).slice(0, 3000)}`, answers: state?.answers ?? [], sources: prior.sources ?? [], size: prior.size };
    db().prepare("UPDATE projects SET status='queued',artifact_json=?,updated_at=? WHERE id=?").run(JSON.stringify(intake), now(), projectId);
    enqueue(projectId, "design-generate");
    return redirect;
  }
  const prior = row.artifact_json ? JSON.parse(row.artifact_json) : null;
  const instructions = `Revision requested: ${request}. Preserve supported facts and earlier user answers. Use the previous draft only as reference.`;
  db().prepare("UPDATE projects SET status='queued',brief=?,artifact_json=?,updated_at=? WHERE id=?")
    .run(`${row.brief}\nRevision: ${request}`.slice(0, 5000), JSON.stringify({ instructions, slideCount: "auto", referenceNotes: prior ? JSON.stringify(prior).slice(0, 3500) : "" }), now(), projectId);
  enqueue(projectId, "generate-simple");
  return redirect;
}
