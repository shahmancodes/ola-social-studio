import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  database: null as DatabaseSync | null, time: "2026-10-25T10:00:00.000Z", generate: vi.fn(),
  edit: vi.fn(), notifyFailed: vi.fn(), notifyComplete: vi.fn(), notifyReview: vi.fn(), record: vi.fn(), brand: vi.fn(),
}));
vi.mock("./lib/platform-db", () => ({
  db: () => fixture.database!, now: () => fixture.time,
  projectRow: (id: string) => fixture.database!.prepare("SELECT * FROM projects WHERE id=?").get(id), enqueue: vi.fn(),
}));
vi.mock("./lib/ai-execution", () => ({ withProjectAi: (_id: string, _kind: string, task: () => Promise<unknown>) => task() }));
vi.mock("./lib/ai-usage", () => ({ recoverInterruptedRuns: vi.fn(), reconcileUsage: vi.fn() }));
vi.mock("./lib/simple-content", () => ({ generateSimpleArtifact: fixture.generate, reviewSavedSimpleArtifact: vi.fn(), resumeCompositionCandidates: vi.fn() }));
vi.mock("./lib/freeform-design", () => ({ advanceDesignIntake: vi.fn(), generateDesign: vi.fn(), reviewSavedDesign: vi.fn() }));
vi.mock("./lib/intake", () => ({ advanceIntake: vi.fn() }));
vi.mock("./lib/brand-analysis", () => ({ runBrandJob: fixture.brand }));
vi.mock("./lib/workflow-state", () => ({ recordWorkflowEvent: fixture.record }));
vi.mock("./lib/whatsapp", () => ({
  processWhatsAppEditJob: fixture.edit, flushWhatsAppMessages: vi.fn(), notifyCompletedProject: fixture.notifyComplete, notifyFailedProject: fixture.notifyFailed,
  notifyNeedsReview: fixture.notifyReview, notifySpecialistQuestion: vi.fn(), notifyDesignQuestion: vi.fn(),
}));

import { runOneJob } from "./worker";
const copyError = new Error("Copy repair rejected: Page 1: a bare process line contains unsupported stage copy.");
const job = () => fixture.database!.prepare("SELECT * FROM jobs WHERE id='job'").get() as { attempts: number; status: string; run_after: string; error: string | null; payload_json: string };
const status = () => (fixture.database!.prepare("SELECT status FROM projects WHERE id='project'").get() as { status: string }).status;

beforeEach(() => {
  vi.resetAllMocks();
  fixture.database?.close();
  fixture.database = new DatabaseSync(":memory:");
  fixture.database.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,content_type TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE jobs(id TEXT PRIMARY KEY,project_id TEXT,kind TEXT,payload_json TEXT,status TEXT,attempts INTEGER,run_after TEXT,lease_until TEXT,error TEXT,created_at TEXT,updated_at TEXT);
    INSERT INTO projects VALUES('project','poster','queued','2026-10-25T10:00:00.000Z');
    INSERT INTO jobs VALUES('job','project','generate-simple','{"original":"preserved"}','queued',0,'2026-10-25T10:00:00.000Z',NULL,NULL,'2026-10-25T10:00:00.000Z','2026-10-25T10:00:00.000Z');
  `);
  fixture.time = "2026-10-25T10:00:00.000Z";
  fixture.brand.mockResolvedValue(false);
  fixture.generate.mockRejectedValue(copyError);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

describe("worker automatic recovery", () => {
  it("keeps the same job queued without showing a failed project or sending a failure notification", async () => {
    await runOneJob();
    expect(job()).toMatchObject({ status: "queued", attempts: 1, error: copyError.message, run_after: "2026-10-25T10:00:02.000Z", payload_json: '{"original":"preserved"}' });
    expect(status()).toBe("queued");
    expect(fixture.notifyFailed).not.toHaveBeenCalled();
    expect(fixture.record).toHaveBeenCalledWith("project", "agent", "auto-retry", "poster", expect.any(String), expect.objectContaining({ error: copyError.message, attempt: 2, maxAttempts: 3 }));
    await runOneJob();
    expect(fixture.generate).toHaveBeenCalledTimes(1);
  });

  it("finishes successfully on the next attempt and clears the prior error", async () => {
    await runOneJob();
    fixture.time = job().run_after;
    fixture.generate.mockImplementation(async () => { fixture.database!.exec("UPDATE projects SET status='complete'"); });
    await runOneJob();
    expect(job()).toMatchObject({ status: "complete", attempts: 2, error: null });
    expect(status()).toBe("complete");
    expect(fixture.notifyFailed).not.toHaveBeenCalled();
    expect(fixture.notifyComplete).toHaveBeenCalledTimes(1);
  });

  it("only exposes a failure after the third unsuccessful attempt", async () => {
    await runOneJob();
    fixture.time = job().run_after;
    await runOneJob();
    expect(status()).toBe("queued");
    expect(fixture.notifyFailed).not.toHaveBeenCalled();
    fixture.time = job().run_after;
    await runOneJob();
    expect(job()).toMatchObject({ status: "failed", attempts: 3 });
    expect(status()).toBe("failed");
    expect(fixture.notifyFailed).toHaveBeenCalledExactlyOnceWith("project", copyError.message);
    await runOneJob();
    expect(fixture.generate).toHaveBeenCalledTimes(3);
  });

  it("does not resurrect a run stopped during generation", async () => {
    fixture.generate.mockImplementation(async () => { fixture.database!.exec("UPDATE projects SET status='stopped'"); throw copyError; });
    await runOneJob();
    expect(job().status).toBe("cancelled");
    expect(status()).toBe("stopped");
    expect(fixture.notifyFailed).not.toHaveBeenCalled();
  });

  it("fails immediately when the provider is not configured", async () => {
    fixture.generate.mockRejectedValue(new Error("No AI provider is configured."));
    await runOneJob();
    expect(job()).toMatchObject({ status: "failed", attempts: 1 });
    expect(fixture.notifyFailed).toHaveBeenCalledTimes(1);
  });

  it("never regenerates a completed design when a notification throws", async () => {
    fixture.generate.mockImplementation(async () => { fixture.database!.exec("UPDATE projects SET status='complete'"); });
    fixture.notifyComplete.mockImplementation(() => { throw new Error("fetch failed"); });
    await runOneJob();
    expect(job().status).toBe("complete");
    expect(status()).toBe("complete");
    expect(fixture.notifyFailed).not.toHaveBeenCalled();
  });
  it("runs WhatsApp edits without sending an unrelated completion notification", async () => {
    fixture.database!.exec("UPDATE projects SET status='complete'; UPDATE jobs SET kind='ola-whatsapp',payload_json='{\"phone\":\"test\"}'");
    await runOneJob();
    expect(fixture.edit).toHaveBeenCalledWith("project", { phone: "test" });
    expect(job().status).toBe("complete");
    expect(fixture.notifyComplete).not.toHaveBeenCalled();
    expect(fixture.notifyReview).not.toHaveBeenCalled();
  });

});
