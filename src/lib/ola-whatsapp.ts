import crypto from "node:crypto";
import { db, enqueue, now, projectRow } from "./platform-db";
import { olaHistory, requestOlaEdit, decideOlaProposal, PromptRequestSchema } from "./ola-edit";
import { olaDocumentKey } from "./ola-document";
import { saveSimpleArtifact } from "./simple-content";
import { saveDesignSpec } from "./freeform-design";

/** Both chat surfaces use the same proposal engine, history, validation and version checks. */
export async function answerOlaWhatsAppEdit(projectId: string, userId: string, text: string, externalId: string) {
  const row = projectRow(projectId);
  if (!row?.artifact_json || row.status === "stopped") throw new Error("This project has no editable draft.");
  if (!["complete", "needs-review", "failed"].includes(row.status)) return "Your project is still running. I’ll send an update when it’s ready for edits.";
  const document: unknown = JSON.parse(row.artifact_json);
  const stage = row.content_type === "design" ? "design" : "simple";
  const pending = olaHistory(projectId, userId).pending;
  const decision = /^(?:accept(?: changes)?|apply(?: changes)?|approve|yes)[.!]?$/i.test(text) ? "accepted"
    : /^(?:discard(?: changes)?|reject|no)[.!]?$/i.test(text) ? "discarded" : null;
  if (decision) {
    if (!pending) return "There’s no pending edit. Tell me what you’d like to change.";
    if (decision === "discarded") {
      decideOlaProposal(projectId, userId, { proposalId: pending.id, decision, currentDraft: document });
      return "Discarded the proposed changes. Your saved draft is unchanged.";
    }
    if (pending.stage !== stage || pending.baseVersion !== row.version || olaDocumentKey(pending.origin) !== olaDocumentKey(document)) throw new Error("The saved draft changed, or this preview uses unsaved workspace edits. Save those edits or discard the preview in the workspace first.");
    // Render and save before marking accepted. A failed export keeps the proposal available.
    const saved = stage === "design"
      ? await saveDesignSpec(projectId, pending.candidate, row.version, "qa")
      : await saveSimpleArtifact(projectId, pending.candidate, row.version, "qa");
    db().prepare("UPDATE ola_proposals SET status='accepted',decided_at=? WHERE id=? AND status='pending'").run(now(), pending.id);
    enqueue(projectId, stage === "design" ? "review-design" : "review-simple");
    return `Saved your changes (version ${saved.version}). I’m checking the updated output and will send a link when it’s ready.`;
  }
  if (!text.trim()) return "Describe the change in text. You can also reply status, accept changes, discard changes or new.";
  if (pending && (pending.stage !== stage || pending.baseVersion !== row.version || olaDocumentKey(pending.origin) !== olaDocumentKey(document))) throw new Error("There’s an older or unsaved preview in the workspace. Discard it before requesting another edit.");
  // Deterministic request IDs make worker redelivery reuse the existing result.
  const hash = crypto.createHash("sha256").update(`whatsapp:${externalId}`).digest("hex");
  const requestId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const result = await requestOlaEdit(projectId, userId, PromptRequestSchema.parse({ prompt: text, stage, draft: pending?.candidate ?? document, baseVersion: row.version, requestId, refineProposalId: pending?.id }));
  if ("regenerating" in result && result.regenerating) return "I’ve started rebuilding your project with those instructions. I’ll send the reviewed result when it’s ready.";
  const reply = result.messages.filter(message => message.role === "assistant").at(-1)?.body ?? "Tell me what you’d like to change.";
  const preview = result.pending;
  return preview ? `${reply}\n\nProposed changes: ${preview.summary}\nReply “accept changes” to save, “discard changes” to keep the saved draft, or send another instruction to refine this preview.` : reply;
}
