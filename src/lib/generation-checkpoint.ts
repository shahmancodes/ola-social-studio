import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type CheckpointData = {
  version: 1;
  fingerprint: string;
  inputs: Record<string, unknown>;
  steps: Record<string, { value?: unknown }>;
  activeStep: string | null;
  feedback?: Record<string, unknown>;
};

/** Persist successful steps across worker attempts; rejected work is never cached. */
export class GenerationCheckpoint {
  private constructor(private filename: string, private data: CheckpointData) {}

  static async open(directory: string, identity: unknown, inputs?: Record<string, unknown>) {
    const filename = path.join(directory, "generation-checkpoint.json");
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
    let saved: CheckpointData | undefined;
    try { saved = JSON.parse(await fs.readFile(filename, "utf8")) as CheckpointData; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The saved generation checkpoint could not be read.", { cause: error }); }
    if (saved?.version === 1 && saved.fingerprint === fingerprint && saved.steps && saved.inputs
      && (!inputs || JSON.stringify(saved.inputs) === JSON.stringify(inputs))) return new GenerationCheckpoint(filename, saved);
    const checkpoint = new GenerationCheckpoint(filename, { version: 1, fingerprint, inputs: inputs ?? {}, steps: {}, activeStep: null });
    await checkpoint.save();
    return checkpoint;
  }

  get inputs() { return structuredClone(this.data.inputs); }
  get activeStep() { return this.data.activeStep; }
  get completedSteps() { return Object.keys(this.data.steps); }

  result<T>(name: string): T | undefined { return structuredClone(this.data.steps[name]?.value) as T | undefined; }
  feedback<T>(name: string): T | undefined { return structuredClone(this.data.feedback?.[name]) as T | undefined; }
  async recordFeedback(name: string, value: unknown) {
    this.data.feedback ??= {};
    if (value === undefined) delete this.data.feedback[name];
    else this.data.feedback[name] = structuredClone(value);
    await this.save();
  }

  async invalidate(name: string) {
    delete this.data.steps[name];
    await this.save();
  }

  async step<T>(name: string, run: () => Promise<T>): Promise<T> {
    if (Object.hasOwn(this.data.steps, name)) return structuredClone(this.data.steps[name].value) as T;
    this.data.activeStep = name;
    await this.save();
    let value: T;
    try { value = await run(); }
    catch (error) {
      if (error instanceof Error && Object.isExtensible(error) && !("generationStep" in error)) Object.defineProperty(error, "generationStep", { value: name, configurable: true });
      this.data.activeStep = (error as { generationStep?: string } | null)?.generationStep ?? name;
      await this.save();
      throw error;
    }
    this.data.steps[name] = { value: structuredClone(value) };
    this.data.activeStep = null;
    await this.save();
    return structuredClone(value);
  }

  private async save() {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(this.data), { mode: 0o600 });
      await fs.rename(temporary, this.filename);
    } finally { await fs.rm(temporary, { force: true }); }
  }
}
