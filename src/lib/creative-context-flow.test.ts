import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  row: { id: "project", company_id: "company", content_type: "intake", brief: "Create a poster about revision.", brand_snapshot_json: '{"audience":"Students","voice":"Friendly"}', status: "queued", artifact_json: "{}" },
  answers: [] as Array<{ question: string; answer: string }>,
  events: [] as Array<{ kind: string }>,
  question: { text: "Who is this design for?", options: [] as string[] } as { text: string; options: string[] } | null,
  save: vi.fn(), record: vi.fn(), update: vi.fn(), enqueue: vi.fn(), run: vi.fn(), assess: vi.fn(),
}));
vi.mock("./creative-context", () => ({ requiredCreativeContextQuestion: fixture.assess }));
vi.mock("./workflow-model", () => ({ workflowModelConfigured: () => false, askWorkflowModel: vi.fn() }));
vi.mock("./ai-execution", async (original) => ({ ...await original<typeof import("./ai-execution")>(), withProjectAi: (_id: string, _stage: string, task: () => Promise<unknown>) => task() }));
vi.mock("./platform-db", async (original) => ({
  ...await original<typeof import("./platform-db")>(), projectRow: () => fixture.row,
  db: () => ({ prepare: () => ({ run: fixture.run }) }), enqueue: fixture.enqueue,
}));
vi.mock("./workflow-state", () => ({
  initializeSpecialistWorkflow: vi.fn(),
  workflowState: () => ({ projectId: "project", phase: "working", specialist: "poster", answers: fixture.answers, question: null, route: null }),
  workflowEvents: () => fixture.events, saveWorkflowState: fixture.save, recordWorkflowEvent: fixture.record,
}));
vi.mock("./platform", async (original) => ({ ...await original<typeof import("./platform")>(), updateProjectRecord: fixture.update }));

import { advanceIntake } from "./intake";
import { assessSpecialistBrief } from "./content-specialists";
import { advanceDesignIntake, generateDesign } from "./freeform-design";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(fixture.row, { content_type: "intake", artifact_json: "{}", brief: "Create a poster about revision." });
  fixture.answers = [];
  fixture.events = [];
  fixture.question = { text: "Who is this design for?", options: [] };
  fixture.assess.mockImplementation(async () => fixture.question);
});

describe("creative context gates", () => {
  it("pauses intake when context assessment finds a gap despite saved defaults", async () => {
    await advanceIntake("project");
    expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ phase: "awaiting-input", question: fixture.question }));
    expect(fixture.enqueue).not.toHaveBeenCalled();
    expect(fixture.assess).toHaveBeenCalledWith(fixture.row.brief,[],{audience:'Students',voice:'Friendly'},expect.any(Function));
  });

  it("does not let the three-question limit skip missing tone", async () => {
    fixture.answers = [1, 2, 3].map((index) => ({ question: `Detail ${index}?`, answer: `Answer ${index}` }));
    fixture.question = { text: "What tone should this design use?", options: ["Friendly"] };
    await advanceIntake("project");
    expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ question: fixture.question }));
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });

  it.each(["poster", "story", "carousel", "post", "article", "presentation"])("guards directly submitted %s requests and previously ready specialists", async (type) => {
    fixture.row.content_type = type;
    fixture.events = [{ kind: "specialist-ready" }];
    expect(await assessSpecialistBrief("project")).toBe(false);
    expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ phase: "awaiting-input", question: fixture.question }));
    expect(fixture.record).not.toHaveBeenCalledWith(expect.anything(), "agent", "specialist-ready", expect.anything(), expect.anything());
  });

  it("continues once both fields are known without asking again", async () => {
    fixture.question = null;
    fixture.row.content_type = "poster";
    expect(await assessSpecialistBrief("project")).toBe(true);
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it.each([advanceDesignIntake, generateDesign])("guards free-form intake and direct generation before research or rendering", async (run) => {
    fixture.row.content_type = "design";
    fixture.row.artifact_json = JSON.stringify({ phase: "intake", instructions: "For parents", answers: [], sources: [], size: { label: "Digital", widthPx: 1000, heightPx: 1000 } });
    await run("project");
    expect(fixture.assess).toHaveBeenCalledWith(expect.stringContaining("For parents"), [],{audience:'Students',voice:'Friendly'},expect.any(Function));
    expect(fixture.update).toHaveBeenCalledWith("project", expect.objectContaining({ status: "awaiting-input", artifact: expect.objectContaining({ question: fixture.question }) }));
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });
});
