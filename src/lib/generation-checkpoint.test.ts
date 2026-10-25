import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationCheckpoint } from "./generation-checkpoint";

let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "ola-checkpoint-")); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe("persistent generation checkpoints", () => {
  it("persists rejected-step feedback separately from successful work", async () => {
    const checkpoint = await GenerationCheckpoint.open(directory, "request");
    await checkpoint.step("research", async () => ["Verified"]);
    await checkpoint.recordFeedback("copy-repair", { issues: ["Narrow this claim"], draft: "Rejected wording" });
    const reopened = await GenerationCheckpoint.open(directory, "request");
    expect(reopened.feedback("copy-repair")).toEqual({ issues: ["Narrow this claim"], draft: "Rejected wording" });
    expect(reopened.completedSteps).toEqual(["research"]);
    await reopened.recordFeedback("copy-repair", undefined);
    expect((await GenerationCheckpoint.open(directory, "request")).feedback("copy-repair")).toBeUndefined();
  });

  it("resumes a failed step after reopening without repeating completed research", async () => {
    const research = vi.fn(async () => [{ url: "https://example.com/source", claim: "Verified fact" }]);
    const repair = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("Copy repair rejected")).mockResolvedValueOnce("Corrected copy");
    const run = async () => {
      const checkpoint = await GenerationCheckpoint.open(directory, { brief: "Create a poster" }, { instructions: "Preserve exact copy" });
      await checkpoint.step("research", research);
      return checkpoint.step("copy-repair", repair);
    };
    await expect(run()).rejects.toMatchObject({ generationStep: "copy-repair" });
    expect((await GenerationCheckpoint.open(directory, { brief: "Create a poster" })).activeStep).toBe("copy-repair");
    expect(await run()).toBe("Corrected copy");
    expect(research).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledTimes(2);
  });

  it("keeps original inputs and prevents downstream mutation of saved copy", async () => {
    const checkpoint = await GenerationCheckpoint.open(directory, "request", { instructions: "Keep this", slideCount: 3 });
    const draft = await checkpoint.step("draft", async () => ({ pages: ["Exact headline"] }));
    draft.pages[0] = "Mutation";
    const reopened = await GenerationCheckpoint.open(directory, "request");
    expect(reopened.inputs).toEqual({ instructions: "Keep this", slideCount: 3 });
    expect(await reopened.step("draft", async () => ({ pages: [] }))).toEqual({ pages: ["Exact headline"] });
  });

  it.each(["brief", "brand", "answers", "revision", "policy"])("invalidates previous work when %s changes", async (field) => {
    const identity = { brief: "Initial", brand: "Brand", answers: [], revision: "first", policy: "model" };
    const checkpoint = await GenerationCheckpoint.open(directory, identity);
    await checkpoint.step("research", async () => ["Old result"]);
    const updated = await GenerationCheckpoint.open(directory, { ...identity, [field]: "Changed" });
    expect(updated.completedSteps).toEqual([]);
  });

  it("invalidates on changed explicit instructions", async () => {
    const checkpoint = await GenerationCheckpoint.open(directory, "same brief", { instructions: "First" });
    await checkpoint.step("draft", async () => "Old draft");
    const updated = await GenerationCheckpoint.open(directory, "same brief", { instructions: "Second" });
    expect(updated.completedSteps).toEqual([]);
  });

  it("persists optional skipped steps and keeps inner failure names", async () => {
    const checkpoint = await GenerationCheckpoint.open(directory, "request");
    await checkpoint.step("optional", async () => undefined);
    const reopened = await GenerationCheckpoint.open(directory, "request");
    const run = vi.fn(async () => "Should not run");
    expect(await reopened.step("optional", run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    await expect(reopened.step("quality", () => reopened.step("evidence", async () => { throw new SyntaxError("Invalid JSON"); }))).rejects.toMatchObject({ name: "SyntaxError", generationStep: "evidence" });
  });

  it("does not silently repeat a pipeline when a saved checkpoint is corrupt", async () => {
    await fs.writeFile(path.join(directory, "generation-checkpoint.json"), "broken JSON");
    await expect(GenerationCheckpoint.open(directory, "request")).rejects.toThrow("could not be read");
  });
});
