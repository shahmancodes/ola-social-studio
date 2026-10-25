import { db, projectRow } from "./platform-db";
import { workflowEvents, workflowState, type WorkflowEvent, type WorkflowQuestion } from "./workflow-state";
import { ensurePendingClarification } from "./pending-clarification";

export type RequestOutput = {
  title: string;
  summary: string;
  pages: string[];
  previewUrl: string | null;
  href: string;
  canOpen: boolean;
  actionLabel?: string;
};

export type RequestSnapshot = {
  id: string;
  companyId?: string;
  createdAt?: string;
  updatedAt?: string;
  brief: string;
  type: string;
  status: string;
  queuedAt: string | null;
  specialist: string | null;
  question: WorkflowQuestion | null;
  events: WorkflowEvent[];
  output: RequestOutput | null;
  failure: string | null;
};

type ArtifactPreview = {
  type?: string;
  title?: string;
  headline?: string;
  subline?: string;
  caption?: string;
  sections?: Array<{ title?: string }>;
  slides?: Array<{ title?: string }>;
  imagePath?: string;
  imagePaths?: string[];
  previewPaths?: string[];
  phase?: string;
  question?: WorkflowQuestion;
};

function genericOutput(id: string, status: string, artifact: ArtifactPreview): RequestOutput | null {
  if (!artifact.type) return null;
  const pages = artifact.sections?.map((section) => section.title ?? "Untitled section") ?? artifact.slides?.map((slide) => slide.title ?? "Untitled slide") ?? [];
  const image = Boolean(artifact.imagePath || artifact.imagePaths?.length || artifact.previewPaths?.length);
  const previewUrl = image ? `/api/content/${id}/preview?slide=1` : null;
  return {
    title: artifact.title || artifact.headline || "Untitled draft",
    summary: artifact.subline || artifact.caption || `${pages.length || 1} editable ${pages.length === 1 ? "page" : "pages"}`,
    pages: pages.slice(0, 8),
    previewUrl,
    href: `/content/${id}`,
    canOpen: ["complete", "needs-review", "failed"].includes(status),
  };
}

export async function requestSnapshot(projectId: string): Promise<RequestSnapshot> {
  await ensurePendingClarification(projectId);
  const row = projectRow(projectId);
  if (!row) throw new Error("Request not found.");
  const state = workflowState(projectId);
  const events = workflowEvents(projectId);
  const artifact = row.artifact_json ? JSON.parse(row.artifact_json) as ArtifactPreview : null;
  const output = artifact ? genericOutput(projectId, row.status, artifact) : null;
  const designQuestion = row.content_type === "design" && artifact?.phase === "intake" ? artifact.question : null;
  const failure = row.status === "failed" ? (db().prepare("SELECT error FROM jobs WHERE project_id=? AND status='failed' ORDER BY updated_at DESC LIMIT 1").get(projectId) as { error: string | null } | undefined)?.error?.slice(0, 450) ?? null : null;
  const queuedAt = row.status === "queued" ? (db().prepare("SELECT created_at FROM jobs WHERE project_id=? AND status='queued' ORDER BY created_at DESC LIMIT 1").get(projectId) as { created_at: string } | undefined)?.created_at ?? null : null;
  const brief = events.find(event => event.actor === "user" && event.kind === "prompt")?.body ?? row.brief;
  return { id: row.id, companyId: row.company_id, createdAt: row.created_at, updatedAt: row.updated_at, brief, type: row.content_type, status: row.status, queuedAt, specialist: state?.specialist ?? null, question: designQuestion ?? state?.question ?? null, events, output, failure };
}
