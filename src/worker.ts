import { db, enqueue, now, projectRow } from "./lib/platform-db";
import { generateSimpleArtifact, reviewSavedSimpleArtifact } from "./lib/simple-content";
import { flushWhatsAppMessages, notifyCompletedProject, notifyFailedProject, notifyNeedsReview, notifySpecialistQuestion } from "./lib/whatsapp";
import { advanceDesignIntake, generateDesign, reviewSavedDesign } from "./lib/freeform-design";
import { notifyDesignQuestion } from "./lib/whatsapp";
import { runBrandJob } from "./lib/brand-analysis";
import { advanceIntake } from "./lib/intake";
import { recordWorkflowEvent } from "./lib/workflow-state";

type Job = { id: string; project_id: string; kind: string; payload_json: string; attempts: number };

function claimJob(): Job | undefined {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE jobs SET status='queued',lease_until=NULL WHERE status='running' AND lease_until<?").run(now());
    const job = database.prepare("SELECT * FROM jobs WHERE status='queued' AND run_after<=? ORDER BY created_at LIMIT 1").get(now()) as Job | undefined;
    if (job) database.prepare("UPDATE jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=?")
      .run(new Date(Date.now() + 15 * 60_000).toISOString(), now(), job.id);
    database.exec("COMMIT");
    return job;
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

export async function runOneJob() {
  const job = claimJob();
  if (!job) return runBrandJob();
  const startedAt = Date.now();
  const leaseHeartbeat = setInterval(() => {
    db().prepare("UPDATE jobs SET lease_until=?,updated_at=? WHERE id=? AND status='running'")
      .run(new Date(Date.now() + 15 * 60_000).toISOString(), now(), job.id);
  }, 60_000);
  let staleReview: "review-simple" | "review-design" | null = null;
  try {
    const project = projectRow(job.project_id);
    if (!project || project.status === "stopped") throw new Error("Project stopped or missing.");
    const payload = JSON.parse(job.payload_json);
    switch (job.kind) {
      case "intake-route": await advanceIntake(job.project_id); break;
      case "generate-simple": await generateSimpleArtifact(job.project_id); notifySpecialistQuestion(job.project_id); break;
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
    db().prepare("UPDATE jobs SET status='complete',lease_until=NULL,updated_at=? WHERE id=?").run(now(), job.id);
    if (staleReview) enqueue(job.project_id, staleReview);
    notifyCompletedProject(job.project_id);
    notifyNeedsReview(job.project_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db().prepare("UPDATE jobs SET status='failed',error=?,lease_until=NULL,updated_at=? WHERE id=?").run(message, now(), job.id);
    if (projectRow(job.project_id)?.status !== "stopped") db().prepare("UPDATE projects SET status='failed',updated_at=? WHERE id=?").run(now(), job.project_id);
    if (projectRow(job.project_id)?.status !== "stopped") notifyFailedProject(job.project_id, message);
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
  process.stdout.write("Content worker started.\n");
  const stop = { value: false };
  process.on("SIGINT", () => { stop.value = true; });
  process.on("SIGTERM", () => { stop.value = true; });
  while (!stop.value) {
    const ran = await runOneJob();
    await flushWhatsAppMessages();
    if (!ran) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
