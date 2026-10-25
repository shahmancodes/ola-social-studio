import { withProjectAi } from "./lib/ai-execution";
import { startWorkerHeartbeat } from './lib/worker-heartbeat';
import { reconcileUsage, recoverInterruptedRuns } from "./lib/ai-usage";
import { db, enqueue, now, projectRow } from "./lib/platform-db";
import { generateSimpleArtifact, reviewSavedSimpleArtifact, resumeCompositionCandidates, improveSavedSimpleArtifact } from "./lib/simple-content";
import { flushWhatsAppMessages, notifyCompletedProject, notifyFailedProject, notifyNeedsReview, notifySpecialistQuestion, processWhatsAppEditJob } from "./lib/whatsapp";
import { advanceDesignIntake, generateDesign, reviewSavedDesign } from "./lib/freeform-design";
import { notifyDesignQuestion } from "./lib/whatsapp";
import { runBrandJob } from "./lib/brand-analysis";
import { advanceIntake } from "./lib/intake";
import { recordWorkflowEvent } from "./lib/workflow-state";
import { jobRetryDelay, MAX_JOB_ATTEMPTS } from "./lib/job-retry";

type Job = { id: string; project_id: string; kind: string; payload_json: string; attempts: number };

function claimJob(): Job | undefined {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE jobs SET status='queued',lease_until=NULL WHERE status='running' AND lease_until<?").run(now());
    const job = database.prepare("SELECT * FROM jobs WHERE status='queued' AND run_after<=? AND NOT EXISTS(SELECT 1 FROM jobs active WHERE active.project_id=jobs.project_id AND active.status='running') ORDER BY created_at LIMIT 1").get(now()) as Job | undefined;
    if (job) database.prepare("UPDATE jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=?")
      .run(new Date(Date.now() + 15 * 60_000).toISOString(), now(), job.id);
    database.exec("COMMIT");
    return job ? { ...job, attempts: job.attempts + 1 } : undefined;
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

export async function runOneJob() {
  recoverInterruptedRuns();
  const job = claimJob();
  if (!job) return runBrandJob();
  const startedAt = Date.now();
  const leaseHeartbeat = setInterval(() => {
    db().prepare("UPDATE jobs SET lease_until=?,updated_at=? WHERE id=? AND status='running'")
      .run(new Date(Date.now() + 15 * 60_000).toISOString(), now(), job.id);
  }, 60_000);
  let staleReview: "review-simple" | "review-design" | null = null;
  let completed = false;
  try {
    const project = projectRow(job.project_id);
    if (!project || project.status === "stopped") throw new Error("Project stopped or missing.");
    await withProjectAi(job.project_id, job.kind, async () => {
    switch (job.kind) {
      case "ola-whatsapp": await processWhatsAppEditJob(job.project_id, JSON.parse(job.payload_json)); break;
      case "intake-route": await advanceIntake(job.project_id); break;
      case "generate-simple": await generateSimpleArtifact(job.project_id); notifySpecialistQuestion(job.project_id); break;
      case "resume-composition": await resumeCompositionCandidates(job.project_id); break;
      case "improve-simple": await improveSavedSimpleArtifact(job.project_id); break;
      case "review-simple": if (!await reviewSavedSimpleArtifact(job.project_id)) staleReview = "review-simple"; break;
      case "design-clarify": {
        const question = await advanceDesignIntake(job.project_id);
        if (question) notifyDesignQuestion(job.project_id, question);
        break;
      }
      case "design-generate": await generateDesign(job.project_id); break;
      case "review-design": if (!await reviewSavedDesign(job.project_id)) staleReview = "review-design"; break;
      default: throw new Error(`Unknown job kind: ${job.kind}`);
    }
    }, job.id);
    db().prepare("UPDATE jobs SET status='complete',error=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now(), job.id);
    completed = true;
    if (staleReview) enqueue(job.project_id, staleReview);
    if (job.kind !== "ola-whatsapp") {
      notifyCompletedProject(job.project_id);
      notifyNeedsReview(job.project_id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A notification failure must never restart a successfully completed design.
    if (completed) {
      process.stderr.write(`Job ${job.id} completed, but its follow-up failed: ${message}\n`);
      return true;
    }
    const database = db();
    let retryAt: string | null = null;
    database.exec("BEGIN IMMEDIATE");
    try {
      const project = projectRow(job.project_id);
      const delay = project ? jobRetryDelay(job.kind, error, job.attempts, project.status) : null;
      if (delay !== null) {
        retryAt = new Date(Date.parse(now()) + delay).toISOString();
        database.prepare("UPDATE jobs SET status='queued',error=?,lease_until=NULL,run_after=?,updated_at=? WHERE id=?").run(message, retryAt, now(), job.id);
        database.prepare("UPDATE projects SET status='queued',updated_at=? WHERE id=?").run(now(), job.project_id);
        const step = (error as { generationStep?: string } | null)?.generationStep;
        recordWorkflowEvent(job.project_id, "agent", "auto-retry", project!.content_type, `Retrying${step ? ` ${step.replaceAll("-", " ")}` : ""} automatically (attempt ${job.attempts + 1} of ${MAX_JOB_ATTEMPTS}).`, { error: message, step, attempt: job.attempts + 1, maxAttempts: MAX_JOB_ATTEMPTS, retryAt });
      } else {
        database.prepare("UPDATE jobs SET status=?,error=?,lease_until=NULL,updated_at=? WHERE id=?").run(project?.status === "stopped" ? "cancelled" : "failed", message, now(), job.id);
        if (project && !["stopped", "complete", "needs-review", "awaiting-input", "coming-soon"].includes(project.status)) database.prepare("UPDATE projects SET status='failed',updated_at=? WHERE id=?").run(now(), job.project_id);
      }
      database.exec("COMMIT");
    } catch (cause) { database.exec("ROLLBACK"); throw cause; }
    if (!retryAt && projectRow(job.project_id)?.status === "failed") notifyFailedProject(job.project_id, message);
    process.stderr.write(`Job ${job.id} failed: ${message}\n`);
  } finally {
    clearInterval(leaseHeartbeat);
    const row = projectRow(job.project_id);
    if (row) {
      recordWorkflowEvent(job.project_id, "system", "job-metrics", job.kind, "Pipeline job measured.", { durationMs: Date.now() - startedAt, finalReviewState: row.status });
    }
  }
  return true;
}

export async function startWorker() {
  recoverInterruptedRuns();
  const stopHeartbeat = startWorkerHeartbeat(db(), 'ola', { concurrency: 1, capabilities: ['content-jobs', 'brand-analysis', 'usage-reconciliation', 'messaging'] });
  process.stdout.write("Content worker started.\n");
  const stop = { value: false };
  process.on("SIGINT", () => { stop.value = true; });
  process.on("SIGTERM", () => { stop.value = true; });
  let accounting: Promise<unknown> | undefined; let nextAccounting = 0;
  try { while (!stop.value) {
    if (!accounting && Date.now() > nextAccounting) { nextAccounting = Date.now() + 30000; accounting = reconcileUsage().catch(() => {}).finally(() => { accounting = undefined; }); }
    const ran = await runOneJob();
    await flushWhatsAppMessages();
    if (!ran) await new Promise((resolve) => setTimeout(resolve, 1500));
  } } finally { stopHeartbeat(); }
}
