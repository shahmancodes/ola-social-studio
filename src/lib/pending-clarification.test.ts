import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ database: null as DatabaseSync | null, ask: vi.fn() }));
vi.mock("./platform-db", () => ({
  db: () => fixture.database!, now: () => "2026-10-25T10:00:00Z",
  projectRow: (id: string) => fixture.database!.prepare("SELECT * FROM projects WHERE id=?").get(id),
}));
vi.mock("./ai-execution", () => ({ withProjectAi: (_id: string, _stage: string, task: () => Promise<unknown>) => task() }));
vi.mock("./workflow-model", () => ({ workflowModelConfigured: () => true, askWorkflowModel: fixture.ask }));

import { ensurePendingClarification } from "./pending-clarification";
import { workflowState } from "./workflow-state";

const authored = { text: "Which readers should this GitHub and GitLab comparison help?", options: ["Software developers", "Engineering teams", "Students learning Git"] };
beforeEach(() => {
  vi.clearAllMocks();
  fixture.database = new DatabaseSync(":memory:");
  fixture.database.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,content_type TEXT,brief TEXT,artifact_json TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE workflow_state(project_id TEXT PRIMARY KEY,phase TEXT,specialist TEXT,answers_json TEXT,question_json TEXT,route_json TEXT,updated_at TEXT);
    CREATE TABLE workflow_events(id TEXT PRIMARY KEY,project_id TEXT,actor TEXT,kind TEXT,stage TEXT,body TEXT,data_json TEXT,artifact_version INTEGER,created_at TEXT);
    INSERT INTO projects VALUES('project','intake','Create an A4 poster about GitHub vs GitLab.','{}','awaiting-input','2026-10-25T10:00:00Z');
    INSERT INTO workflow_state VALUES('project','awaiting-input','poster','[]','{"text":"Who is this design for?","options":[]}',NULL,'2026-10-25T10:00:00Z');
    INSERT INTO workflow_events VALUES('question','project','assistant','question','intake','Who is this design for?','{"options":[]}',1,'2026-10-25T10:00:00Z');
  `);
  fixture.ask.mockResolvedValue(authored);
});
afterEach(() => { fixture.database?.close(); });

describe("unanswered legacy question upgrade", () => {
  it("persists the model's wording and choices, then reuses them on later polls", async () => {
    await ensurePendingClarification("project");
    expect(workflowState("project")?.question).toEqual({ ...authored, purpose: "audience", generatedBy: "llm" });
    expect(fixture.database!.prepare("SELECT body FROM workflow_events WHERE id='question'").get()).toEqual({ body: authored.text });
    await ensurePendingClarification("project");
    expect(fixture.ask).toHaveBeenCalledTimes(1);
  });

  it("shares one model call across simultaneous polling requests", async () => {
    let resolve!: (value: typeof authored) => void;
    fixture.ask.mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = ensurePendingClarification("project");
    const second = ensurePendingClarification("project");
    expect(fixture.ask).toHaveBeenCalledTimes(1);
    resolve(authored);
    await Promise.all([first, second]);
    expect(workflowState("project")?.question?.options).toEqual(authored.options);
  });

  it("does not restore a question answered while the model was running", async () => {
    let resolve!: (value: typeof authored) => void;
    fixture.ask.mockReturnValue(new Promise((done) => { resolve = done; }));
    const request = ensurePendingClarification("project");
    fixture.database!.exec("UPDATE projects SET status='queued'; UPDATE workflow_state SET question_json=NULL,phase='working';");
    resolve(authored);
    await request;
    expect(workflowState("project")?.question).toBeNull();
    expect(fixture.database!.prepare("SELECT status FROM projects").get()).toEqual({ status: "queued" });
  });

  it("upgrades a saved free-form question in its intake artifact", async () => {
    fixture.database!.exec("UPDATE projects SET content_type='design',artifact_json='{\"phase\":\"intake\",\"answers\":[],\"question\":{\"text\":\"Who is this design for?\",\"options\":[]}}'; UPDATE workflow_state SET question_json=NULL;");
    await ensurePendingClarification("project");
    const row = fixture.database!.prepare("SELECT artifact_json FROM projects").get() as { artifact_json: string };
    expect(JSON.parse(row.artifact_json).question).toEqual({ ...authored, purpose: "audience", generatedBy: "llm" });
  });
});
