import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ database: null as DatabaseSync | null }));
vi.mock("./platform-db", async () => {
  const actual = await vi.importActual<typeof import("./platform-db")>("./platform-db");
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, company_id TEXT, content_type TEXT, brief TEXT, brand_snapshot_json TEXT, status TEXT, version INTEGER);
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT, email TEXT);
    CREATE TABLE assets (id TEXT PRIMARY KEY, company_id TEXT, media_type TEXT, name TEXT, category TEXT);
    CREATE TABLE project_references (id TEXT PRIMARY KEY, project_id TEXT, media_type TEXT, name TEXT);
    CREATE TABLE ola_messages (id TEXT PRIMARY KEY, project_id TEXT, user_id TEXT, role TEXT, stage TEXT, body TEXT, proposal_id TEXT, created_at TEXT);
    CREATE TABLE ola_proposals (id TEXT PRIMARY KEY, project_id TEXT, user_id TEXT, stage TEXT, base_version INTEGER, base_json TEXT, origin_json TEXT, candidate_json TEXT, summary TEXT, status TEXT, created_at TEXT, decided_at TEXT);
    CREATE TABLE workflow_events (id TEXT PRIMARY KEY, project_id TEXT, actor TEXT, kind TEXT, stage TEXT, body TEXT, data_json TEXT, artifact_version INTEGER, created_at TEXT);
    CREATE TABLE workflow_state (project_id TEXT PRIMARY KEY, phase TEXT, specialist TEXT, answers_json TEXT, question_json TEXT, route_json TEXT, updated_at TEXT);
  `);
  fixture.database = database;
  return { ...actual, db: () => database, projectRow: (id: string) => database.prepare("SELECT * FROM projects WHERE id=?").get(id), id: () => crypto.randomUUID(), now: () => new Date().toISOString() };
});

import { decideOlaProposal, olaHistory, PromptRequestSchema, requestOlaEdit } from "./ola-edit";
import { SimpleArtifactSchema } from "./simple-content";

const projectId = "project-1";
const userId = "user-1";
const draft = SimpleArtifactSchema.parse({ type: "post", designVersion: 2, headline: "Before", subline: "Original line", caption: "Caption", artwork: [], researchSources: [] });
const prompt = (changes: Record<string, unknown> = {}) => PromptRequestSchema.parse({ prompt: "Make this clearer", stage: "simple", draft, baseVersion: 1, requestId: crypto.randomUUID(), ...changes });

beforeEach(() => {
  const database = fixture.database!;
  database.exec("DELETE FROM ola_messages; DELETE FROM ola_proposals; DELETE FROM workflow_events; DELETE FROM project_references; DELETE FROM assets; DELETE FROM users; DELETE FROM projects;");
  database.prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?)").run(projectId, "company-1", "post", "Help students study", "{}", "complete", 1);
  database.prepare("INSERT INTO users VALUES(?,?,?)").run(userId, "Editor", "editor@example.test");
});

describe("Ola proposal lifecycle", () => {
  it("keeps pipeline questions and answers out of the editor conversation", async () => {
    const insert = fixture.database!.prepare("INSERT INTO workflow_events VALUES(?,?,?,?,?,?,?,?,?)");
    insert.run("question-1", projectId, "assistant", "question", "intake", "Which audience?", null, null, "2026-10-14T00:00:00Z");
    insert.run("answer-1", projectId, "user", "answer", "intake", "IB students", null, null, "2026-10-14T00:01:00Z");
    expect(olaHistory(projectId, userId).messages).toEqual([]);
    const result = await requestOlaEdit(projectId, userId, prompt(), async () => ({ reply: "Updated.", operations: [{ op: "set", path: ["headline"], value: "New headline" }] }));
    expect(result.messages.map((item) => item.body)).toEqual(expect.arrayContaining(["Make this clearer", "Updated."]));
    expect(result.messages).toHaveLength(2);
    expect(fixture.database!.prepare("SELECT COUNT(*) AS count FROM workflow_events").get()).toMatchObject({ count: 2 });
  });

  it("submits component comments in one proposal and retains them in editing history", async () => {
    const comments = [
      { target: { label: "Headline", path: ["headline"] }, body: "Make this clearer" },
      { target: { label: "Subline", path: ["subline"] }, body: "Make this shorter" },
    ];
    const result = await requestOlaEdit(projectId, userId, prompt({ comments }), async (modelPrompt) => {
      expect(modelPrompt).toContain('COMPONENT COMMENTS: [{"target":{"label":"Headline"');
      return { reply: "Updated both components.", operations: [{ op: "set", path: ["headline"], value: "Clear headline" }, { op: "set", path: ["subline"], value: "Short line" }] };
    });
    expect(result.pending?.candidate).toMatchObject({ headline: "Clear headline", subline: "Short line" });
    expect(result.messages.find((item) => item.role === "user")?.body).toContain("2. Subline: Make this shorter");
    await expect(requestOlaEdit(projectId, userId, prompt({ comments }), async () => ({ reply: "Changed caption.", operations: [{ op: "set", path: ["caption"], value: "Outside the comments" }] }))).rejects.toThrow(/outside the commented/);
  });

  it("retains history, refines a preview and accepts only against the original draft", async () => {
    const first = await requestOlaEdit(projectId, userId, prompt(), async () => ({ reply: "Updated the headline.", summary: "Clearer headline", operations: [{ op: "set", path: ["headline"], value: "A clearer headline" }] }));
    expect(first.pending?.candidate).toMatchObject({ headline: "A clearer headline" });
    const second = await requestOlaEdit(projectId, userId, prompt({ draft: first.pending!.candidate, refineProposalId: first.pending!.id }), async () => ({ reply: "Shortened the subline.", summary: "Shorter subline", operations: [{ op: "set", path: ["subline"], value: "Short line" }] }));
    expect(second.pending?.candidate).toMatchObject({ headline: "A clearer headline", subline: "Short line" });
    expect(() => decideOlaProposal(projectId, userId, { proposalId: second.pending!.id, decision: "accepted", currentDraft: { ...draft, headline: "Changed elsewhere" } })).toThrow(/draft changed/);
    const accepted = decideOlaProposal(projectId, userId, { proposalId: second.pending!.id, decision: "accepted", currentDraft: draft });
    expect(accepted.candidate).toMatchObject({ headline: "A clearer headline", subline: "Short line" });
    expect(olaHistory(projectId, userId).messages).toHaveLength(4);
    expect(olaHistory(projectId, userId).pending).toBeNull();
  });

  it("discards without changing the draft and rejects stale project versions", async () => {
    const result = await requestOlaEdit(projectId, userId, prompt(), async () => ({ reply: "Proposed a change.", operations: [{ op: "set", path: ["headline"], value: "Different headline" }] }));
    const discarded = decideOlaProposal(projectId, userId, { proposalId: result.pending!.id, decision: "discarded", currentDraft: { ...draft, headline: "Locally changed" } });
    expect(discarded.candidate).toBeNull();
    expect(draft.type === "post" && draft.headline).toBe("Before");
    fixture.database!.prepare("UPDATE projects SET version=2 WHERE id=?").run(projectId);
    await expect(requestOlaEdit(projectId, userId, prompt(), async () => ({ reply: "No edit", operations: [] }))).rejects.toThrow(/changed/);
  });

  it("rejects an image outside the project's company", async () => {
    await expect(requestOlaEdit(projectId, userId, prompt(), async () => ({ reply: "Use this image", operations: [{ op: "set", path: ["assetId"], value: "other-company-asset" }] }))).rejects.toThrow(/outside this company/);
    expect(olaHistory(projectId, userId).messages).toHaveLength(0);
  });
});
