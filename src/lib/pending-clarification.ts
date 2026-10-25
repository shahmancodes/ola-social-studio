import { withProjectAi } from "./ai-execution";
import { ClarificationQuestionSchema, generateClarificationQuestion } from "./clarification-question";
import { db, now, projectRow } from "./platform-db";
import { saveWorkflowState, workflowEvents, workflowState, type QuestionPurpose, type WorkflowAnswer, type WorkflowQuestion } from "./workflow-state";

const pending = new Map<string, Promise<void>>();
type IntakeArtifact = { phase?: string; instructions?: string; answers?: WorkflowAnswer[]; question?: WorkflowQuestion };

/** Upgrade unanswered legacy questions once, sharing one model request across polling clients. */
export async function ensurePendingClarification(projectId: string): Promise<void> {
  const existing = pending.get(projectId);
  if (existing) return existing;
  const task = refreshQuestion(projectId);
  pending.set(projectId, task);
  try { await task; }
  finally { if (pending.get(projectId) === task) pending.delete(projectId); }
}

async function refreshQuestion(projectId: string) {
  const row = projectRow(projectId);
  if (!row || row.status !== "awaiting-input") return;
  const state = workflowState(projectId);
  const artifact: IntakeArtifact = JSON.parse(row.artifact_json ?? "{}");
  const question = (row.content_type === "design" && artifact.phase === "intake" ? artifact.question : null) ?? state?.question;
  if (!question || question.generatedBy === "llm" && ClarificationQuestionSchema.safeParse(question).success) return;
  const purpose: QuestionPurpose = question.purpose ?? (/audience|who.*for/i.test(question.text) ? "audience" : /tone|voice/i.test(question.text) ? "tone" : "other");
  const replacement = await withProjectAi(projectId, "clarification", () => generateClarificationQuestion({
    brief: `${row.brief}\n${artifact.instructions ?? ""}`,
    answers: artifact.phase === "intake" ? artifact.answers ?? state?.answers ?? [] : state?.answers ?? [],
    purpose,
    goal: `Resolve the same missing detail as this unanswered question, writing both fresh wording and relevant suggested answers: ${question.text}`,
    constraints: `The request format is ${row.content_type}. Only Instagram Story, carousel and poster are available when the format is still undecided. Do not ask for a different detail or assume an answer.`,
  }));
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    // The user may have answered while the model was running. Never restore an obsolete question.
    const latest = projectRow(projectId);
    const latestState = workflowState(projectId);
    const latestArtifact: IntakeArtifact = JSON.parse(latest?.artifact_json ?? "{}");
    const latestQuestion = (latest?.content_type === "design" && latestArtifact.phase === "intake" ? latestArtifact.question : null) ?? latestState?.question;
    if (latest?.status === "awaiting-input" && latest.brief === row.brief && JSON.stringify(latestQuestion) === JSON.stringify(question)) {
      if (latest.content_type === "design" && latestArtifact.phase === "intake") database.prepare("UPDATE projects SET artifact_json=?,updated_at=? WHERE id=?").run(JSON.stringify({ ...latestArtifact, question: replacement }), now(), projectId);
      else if (latestState) saveWorkflowState({ ...latestState, question: replacement });
      const event = workflowEvents(projectId).findLast((entry) => entry.actor === "assistant" && entry.kind === "question" && entry.body === question.text);
      if (event) database.prepare("UPDATE workflow_events SET body=?,data_json=? WHERE id=?").run(replacement.text, JSON.stringify({ ...(event.data && typeof event.data === "object" ? event.data : {}), options: replacement.options, purpose, generatedBy: "llm" }), event.id);
    }
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}
