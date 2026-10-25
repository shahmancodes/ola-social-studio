import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ database: null as DatabaseSync | null, edit: vi.fn(), history: vi.fn(), decide: vi.fn(), save: vi.fn(), saveDesign: vi.fn(), companies: vi.fn() }));
vi.mock("./platform-db", async original => ({ ...await original<typeof import("./platform-db")>(), db: () => fixture.database!, enqueue: (projectId: string, kind: string, payload: unknown = {}) => {
  fixture.database!.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), projectId, kind, JSON.stringify(payload), "queued", "2026-10-25", "2026-10-25", "2026-10-25");
}, projectRow: (id: string) => fixture.database!.prepare("SELECT * FROM projects WHERE id=?").get(id) }));
vi.mock("./ola-edit", async original => ({ ...await original<typeof import("./ola-edit")>(), requestOlaEdit: fixture.edit, olaHistory: fixture.history, decideOlaProposal: fixture.decide }));
vi.mock("./simple-content", async original => ({ ...await original<typeof import("./simple-content")>(), saveSimpleArtifact: fixture.save }));
vi.mock("./freeform-design", async original => ({ ...await original<typeof import("./freeform-design")>(), saveDesignSpec: fixture.saveDesign }));
vi.mock("./platform", async original => ({ ...await original<typeof import("./platform")>(), companiesForUser: fixture.companies }));
import { answerOlaWhatsAppEdit } from "./ola-whatsapp";
import { processWhatsAppMessage, processWhatsAppEditJob } from "./whatsapp";
const draft = { type: "poster", headline: "Before", subline: "Body", cta: "Try it", artwork: [], researchSources: [] };
const pending = () => ({ id: crypto.randomUUID(), stage: "simple", baseVersion: 1, origin: draft, candidate: { ...draft, headline: "After" }, summary: "New headline" });
const outgoing = () => (fixture.database!.prepare("SELECT body FROM messages WHERE direction='out' ORDER BY rowid").all() as { body: string }[]).map(row => JSON.parse(row.body).text as string);
beforeEach(() => {
  vi.resetAllMocks();
  fixture.database?.close();
  fixture.database = new DatabaseSync(":memory:");
  fixture.database.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,company_id TEXT,content_type TEXT,status TEXT,version INTEGER,artifact_json TEXT);
    CREATE TABLE ola_proposals(id TEXT PRIMARY KEY,status TEXT,decided_at TEXT);
    CREATE TABLE jobs(id TEXT PRIMARY KEY,project_id TEXT,kind TEXT,payload_json TEXT,status TEXT,run_after TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY,phone TEXT,direction TEXT,body TEXT,external_id TEXT UNIQUE,status TEXT,created_at TEXT);
    CREATE TABLE whatsapp_links(phone TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE conversations(phone TEXT PRIMARY KEY,state_json TEXT,updated_at TEXT);
    INSERT INTO whatsapp_links VALUES('test-phone','user');
    INSERT INTO conversations VALUES('test-phone','{"projectId":"project"}', '2026-10-25');
  `);
  fixture.database.prepare("INSERT INTO projects VALUES(?,?,?,?,?,?)").run("project", "company", "poster", "complete", 1, JSON.stringify(draft));
  fixture.history.mockReturnValue({ messages: [], pending: null });
  fixture.edit.mockResolvedValue({ messages: [{ role: "assistant", body: "I updated the headline." }], pending: pending() });
  fixture.save.mockResolvedValue({ version: 2 });
  fixture.companies.mockReturnValue([{ id: "company", name: "Company" }]);
});
describe("WhatsApp shared Ola editor", () => {
  it("uses the same edit engine, deterministic delivery IDs and pending preview refinement", async () => {
    const p = pending(); fixture.history.mockReturnValue({ pending: p });
    const reply = await answerOlaWhatsAppEdit("project", "user", "Make it clearer", "external-1");
    expect(reply).toContain("accept changes");
    expect(fixture.edit).toHaveBeenCalledWith("project", "user", expect.objectContaining({ stage: "simple", draft: p.candidate, refineProposalId: p.id }));
    const firstId = fixture.edit.mock.calls[0][2].requestId;
    await answerOlaWhatsAppEdit("project", "user", "Make it clearer", "external-1");
    expect(fixture.edit.mock.calls[1][2].requestId).toBe(firstId);
    expect(fixture.save).not.toHaveBeenCalled();
  });
  it("saves accepted changes before marking accepted and queues QA", async () => {
    const p = pending(); fixture.history.mockReturnValue({ pending: p });
    fixture.database!.prepare("INSERT INTO ola_proposals VALUES(?,'pending',NULL)").run(p.id);
    fixture.save.mockImplementation(async () => {
      expect(fixture.database!.prepare("SELECT status FROM ola_proposals WHERE id=?").get(p.id)).toMatchObject({ status: "pending" });
      return { version: 2 };
    });
    expect(await answerOlaWhatsAppEdit("project", "user", "accept changes", "external-2")).toContain("Saved your changes");
    expect(fixture.save).toHaveBeenCalledWith("project", p.candidate, 1, "qa");
    expect(fixture.database!.prepare("SELECT status FROM ola_proposals WHERE id=?").get(p.id)).toMatchObject({ status: "accepted" });
    expect(fixture.database!.prepare("SELECT kind FROM jobs").get()).toMatchObject({ kind: "review-simple" });
  });
  it("keeps the proposal pending if rendering fails and rejects stale acceptance", async () => {
    const p = pending(); fixture.history.mockReturnValue({ pending: p });
    fixture.database!.prepare("INSERT INTO ola_proposals VALUES(?,'pending',NULL)").run(p.id);
    fixture.save.mockRejectedValue(new Error("Export failed"));
    await expect(answerOlaWhatsAppEdit("project", "user", "accept", "external-3")).rejects.toThrow("Export failed");
    expect(fixture.database!.prepare("SELECT status FROM ola_proposals WHERE id=?").get(p.id)).toMatchObject({ status: "pending" });
    fixture.database!.exec("UPDATE projects SET version=2");
    await expect(answerOlaWhatsAppEdit("project", "user", "accept", "external-4")).rejects.toThrow(/draft changed/);
    expect(fixture.save).toHaveBeenCalledTimes(1);
  });
  it("discards without saving and can answer a question without a proposal", async () => {
    const p = pending(); fixture.history.mockReturnValue({ pending: p });
    expect(await answerOlaWhatsAppEdit("project", "user", "discard changes", "external-5")).toContain("Discarded");
    expect(fixture.decide).toHaveBeenCalledWith("project", "user", { proposalId: p.id, decision: "discarded", currentDraft: draft });
    expect(fixture.save).not.toHaveBeenCalled();
    fixture.history.mockReturnValue({ pending: null });
    fixture.edit.mockResolvedValue({ messages: [{ role: "assistant", body: "The headline states the main idea." }], pending: null });
    expect(await answerOlaWhatsAppEdit("project", "user", "Why this headline?", "external-6")).toBe("The headline states the main idea.");
  });
  it("queues edits quickly, deduplicates webhook delivery and reports busy state", async () => {
    const input = { phone: "test-phone", externalId: "message-1", text: "Make the headline clearer" };
    await processWhatsAppMessage(input);
    expect(fixture.edit).not.toHaveBeenCalled();
    const job = fixture.database!.prepare("SELECT * FROM jobs").get() as { kind: string; payload_json: string };
    expect(job.kind).toBe("ola-whatsapp");
    await processWhatsAppMessage(input);
    expect(outgoing()).toHaveLength(1);
    await processWhatsAppMessage({ ...input, externalId: "message-2" });
    expect(outgoing().at(-1)).toContain("previous message");
    await processWhatsAppEditJob("project", JSON.parse(job.payload_json));
    expect(fixture.edit).toHaveBeenCalledTimes(1);
    expect(outgoing().at(-1)).toContain("accept changes");
  });
  it("checks project membership and conversation identity again before executing a job", async () => {
    fixture.companies.mockReturnValue([]);
    await processWhatsAppMessage({ phone: "test-phone", externalId: "message-3", text: "Change title" });
    expect(outgoing().at(-1)).toContain("no longer have access");
    expect(fixture.database!.prepare("SELECT COUNT(*) n FROM jobs").get()).toMatchObject({ n: 0 });
    await processWhatsAppEditJob("project", { phone: "test-phone", userId: "user", text: "Change title", externalId: "message-4" });
    expect(fixture.edit).not.toHaveBeenCalled();
  });
});
