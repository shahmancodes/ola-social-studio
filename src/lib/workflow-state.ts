import { db, id, now, projectRow } from "./platform-db";

export type WorkflowAnswer = { question: string; answer: string };
export type WorkflowQuestion = { text: string; options: string[] };
export type WorkflowPhase = "routing" | "awaiting-input" | "working" | "review" | "complete" | "coming-soon";
export type WorkflowState = {
  projectId: string;
  phase: WorkflowPhase;
  specialist: string | null;
  answers: WorkflowAnswer[];
  question: WorkflowQuestion | null;
  route: unknown;
};
export type WorkflowEvent = { id: string; projectId: string; actor: string; kind: string; stage: string; body: string; data: unknown; artifactVersion: number | null; createdAt: string };

export function workflowState(projectId: string): WorkflowState | null {
  const row = db().prepare("SELECT * FROM workflow_state WHERE project_id=?").get(projectId) as { project_id: string; phase: WorkflowPhase; specialist: string | null; answers_json: string; question_json: string | null; route_json: string | null } | undefined;
  if (!row) return null;
  return { projectId, phase: row.phase, specialist: row.specialist, answers: JSON.parse(row.answers_json), question: row.question_json ? JSON.parse(row.question_json) : null, route: row.route_json ? JSON.parse(row.route_json) : null };
}

export function saveWorkflowState(state: WorkflowState) {
  db().prepare("INSERT INTO workflow_state(project_id,phase,specialist,answers_json,question_json,route_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET phase=excluded.phase,specialist=excluded.specialist,answers_json=excluded.answers_json,question_json=excluded.question_json,route_json=excluded.route_json,updated_at=excluded.updated_at")
    .run(state.projectId, state.phase, state.specialist, JSON.stringify(state.answers), state.question ? JSON.stringify(state.question) : null, state.route === null ? null : JSON.stringify(state.route), now());
  return state;
}

export function initializeSpecialistWorkflow(projectId: string, specialist: string, brief: string, route: unknown = null) {
  if (workflowState(projectId)) return;
  saveWorkflowState({ projectId, phase: "working", specialist, answers: [], question: null, route });
  recordWorkflowEvent(projectId, "user", "prompt", "intake", brief);
  recordWorkflowEvent(projectId, "assistant", "route", "intake", `I’m making a ${specialist}.`, route);
}

export function recordWorkflowEvent(projectId: string, actor: "user" | "assistant" | "agent" | "qa" | "system", kind: string, stage: string, body: string, data: unknown = null, artifactVersion?: number) {
  const row = projectRow(projectId);
  if (!row) throw new Error("Project not found.");
  const event = { id: id(), projectId, actor, kind, stage, body, data, artifactVersion: artifactVersion ?? row.version, createdAt: now() };
  db().prepare("INSERT INTO workflow_events(id,project_id,actor,kind,stage,body,data_json,artifact_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(event.id, projectId, actor, kind, stage, body, data === null ? null : JSON.stringify(data), event.artifactVersion, event.createdAt);
  return event;
}

export function workflowEvents(projectId: string): WorkflowEvent[] {
  const rows = db().prepare("SELECT * FROM workflow_events WHERE project_id=? ORDER BY rowid").all(projectId) as Array<{ id: string; actor: string; kind: string; stage: string; body: string; data_json: string | null; artifact_version: number | null; created_at: string }>;
  return rows.map((row) => ({ id: row.id, projectId, actor: row.actor, kind: row.kind, stage: row.stage, body: row.body, data: row.data_json ? JSON.parse(row.data_json) : null, artifactVersion: row.artifact_version, createdAt: row.created_at }));
}

export function recordWorkflowQa(projectId: string, gate: string, passed: boolean, report: unknown, artifactVersion?: number) {
  const version = artifactVersion ?? projectRow(projectId)?.version;
  if (version === undefined) throw new Error("Project not found.");
  db().prepare("INSERT INTO workflow_qa(id,project_id,artifact_version,gate,passed,report_json,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id(), projectId, version, gate, passed ? 1 : 0, JSON.stringify(report), now());
  recordWorkflowEvent(projectId, "qa", passed ? "qa-passed" : "qa-failed", gate, passed ? `${gate} QA passed.` : `${gate} QA needs review.`, report, version);
}

export function workflowContext(projectId: string) {
  const state = workflowState(projectId);
  const events = workflowEvents(projectId);
  const decisions = events.filter((event) => ["route", "question", "answer", "source", "quality", "revision", "qa-failed", "qa-passed"].includes(event.kind));
  return { answers: state?.answers ?? [], specialist: state?.specialist ?? null, route: state?.route ?? null, decisions: decisions.slice(-30).map(({ kind, stage, body, data }) => ({ kind, stage, body, data })) };
}
