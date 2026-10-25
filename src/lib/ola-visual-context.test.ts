import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("./paths", () => ({ projectDir: () => path.join(fixture.root, "project") }));
import { olaSavedPreviews } from "./ola-visual-context";
beforeEach(async () => {
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), "ola-previews-"));
  await fs.mkdir(path.join(fixture.root, "project"));
});
afterEach(async () => { await fs.rm(fixture.root, { recursive: true, force: true }); });
const image = async (name: string) => {
  const file = path.join(fixture.root, name);
  await sharp({ create: { width: 20, height: 30, channels: 3, background: "#ffffff" } }).png().toFile(file);
  return file;
};
describe("Ola saved visual context", () => {
  it("provides bounded visual previews and prioritizes the commented page", async () => {
    const file = await image("project/poster.png");
    const previews = await olaSavedPreviews("project", { imagePaths: Array(9).fill(file) }, [{ label: "Slide 8", path: ["slides", 7] }]);
    expect(previews).toHaveLength(3);
    expect(previews[0].page).toBe(8);
    expect(previews[0].url).toMatch(/^data:image\/jpeg;base64,/);
  });
  it("does not read paths or symlink targets outside the project", async () => {
    const outside = await image("outside.png");
    const link = path.join(fixture.root, "project", "link.png");
    await fs.symlink(outside, link);
    expect(await olaSavedPreviews("project", { imagePaths: [outside, link] })).toEqual([]);
  });
  it("continues without images when renders are missing", async () => {
    expect(await olaSavedPreviews("project", { imagePath: path.join(fixture.root, "project", "missing.png") })).toEqual([]);
    expect(await olaSavedPreviews("project", null)).toEqual([]);
  });
});
