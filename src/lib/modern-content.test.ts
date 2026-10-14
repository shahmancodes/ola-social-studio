import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import type { ContentBrand } from "./content-brand";
import { SimpleArtifactSchema } from "./simple-content";
import { renderModernArtifact, reviewModernArtifact } from "./modern-content";

const directories: string[] = [];
async function fixtureDir() { const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ola-content-test-")); directories.push(dir); return dir; }
afterAll(async () => { await Promise.all(directories.map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

function fixtureBrand(dir: string, sparse = false): ContentBrand {
  return {
    companyId: "fixture", name: sparse ? "Plain Co" : "Cedar Learning", audience: "Students", voice: "Direct and useful", description: "Learning resources",
    typography: "Sans serif", imagery: sparse ? "No supplied artwork" : "Simple illustrated study tools", formatRules: "Short copy", examples: [],
    palette: sparse ? { background: "#F5F4F0", alternate: "#FFFFFF", accent: "#5D45B5", ink: "#17151D", dark: "#17151D" } : { background: "#F4F9F5", alternate: "#E2F0E6", accent: "#277A4D", ink: "#142A20", dark: "#142A20" },
    logo: sparse ? undefined : { id: "logo", name: "cedar.svg", mediaType: "image/svg+xml", diskPath: path.join(dir, "cedar.svg"), role: "primary" },
    assets: [],
  };
}

describe("versioned content exports", () => {
  it("keeps text and SVG-derived logo editable/visible in a presentation export", async () => {
    const dir = await fixtureDir();
    await fs.writeFile(path.join(dir, "cedar.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#277A4D"/><text x="15" y="55" fill="white" font-size="35">CEDAR</text></svg>');
    const artifact = SimpleArtifactSchema.parse({ type: "presentation", designVersion: 2, title: "Study routine", slides: [
      { title: "Pick one priority", body: "Choose the topic that needs practice.", layout: "hero" },
      { title: "Reserve practice time", body: "Choose a question. Answer it. Review the error.", layout: "steps" },
      { title: "Review and adjust", body: "Use the next session to check that error again.", layout: "closing" },
    ] });
    await renderModernArtifact(artifact, fixtureBrand(dir), dir);
    expect(artifact.type === "presentation" && artifact.previewPaths?.length).toBe(3);
    const zip = await JSZip.loadAsync(await fs.readFile(artifact.type === "presentation" ? artifact.pptxPath! : ""));
    const slideXml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slideXml).toContain("Pick one priority");
    expect(Object.keys(zip.files).some((name) => name.startsWith("ppt/media/") && name.endsWith(".png"))).toBe(true);
    const preview = await sharp(artifact.type === "presentation" ? artifact.previewPaths![0] : "").metadata();
    expect([preview.width, preview.height]).toEqual([1280, 720]);
  });

  it("renders a sparse brand without inventing artwork and fails closed when visual QA is unavailable", async () => {
    const dir = await fixtureDir();
    const brand = fixtureBrand(dir, true);
    const artifact = SimpleArtifactSchema.parse({ type: "post", designVersion: 2, headline: "Start with one question", subline: "Review what you missed before choosing the next one.", caption: "Choose a question and begin.", layout: "statement" });
    await renderModernArtifact(artifact, brand, dir);
    const image = await sharp(artifact.type === "post" ? artifact.imagePath! : "").metadata();
    expect([image.width, image.height]).toEqual([1080, 1350]);
    const report = await reviewModernArtifact(artifact, brand, 1, async () => { throw new Error("vision unavailable"); });
    expect(report.pass).toBe(false);
    expect(report.issues.join(" ")).toMatch(/visual review unavailable/i);
  });

  it("only clears review when every rubric score meets the threshold and no issue remains", async () => {
    const dir = await fixtureDir();
    const brand = fixtureBrand(dir, true);
    const artifact = SimpleArtifactSchema.parse({ type: "post", designVersion: 2, headline: "Start with one question", subline: "Check it and name one fix.", caption: "Try one question today.", layout: "statement" });
    await renderModernArtifact(artifact, brand, dir);
    const score = async (_prompt: string, images?: string[]) => {
      expect(images?.length).toBe(1);
      return JSON.stringify({ scores: { clarity: 4, usefulness: 4, visualCraft: 4, brandFit: 4, editability: 4 }, issues: [], summary: "Ready." });
    };
    expect((await reviewModernArtifact(artifact, brand, 1, score)).pass).toBe(true);
    const issue = async () => JSON.stringify({ scores: { clarity: 5, usefulness: 5, visualCraft: 5, brandFit: 5, editability: 5 }, issues: ["Headline needs a clearer payoff."], summary: "Revise." });
    expect((await reviewModernArtifact(artifact, brand, 2, issue)).pass).toBe(false);
  });

  it("sends every carousel slide, including the ninth, to visual QA", async () => {
    const dir = await fixtureDir();
    const brand = fixtureBrand(dir, true);
    const artifact = SimpleArtifactSchema.parse({ type: "carousel", designVersion: 2, title: "Nine steps", caption: "A useful sequence.", slides: Array.from({ length: 9 }, (_, index) => ({ title: `Step ${index + 1}`, body: `Do task ${index + 1}.`, layout: (["hero", "steps", "split", "diagram", "closing"] as const)[index % 5] })) });
    await renderModernArtifact(artifact, brand, dir);
    const report = await reviewModernArtifact(artifact, brand, 1, async (_prompt, images) => {
      expect(images).toHaveLength(9);
      return JSON.stringify({ scores: { clarity: 4, usefulness: 4, visualCraft: 4, brandFit: 4, editability: 4 }, issues: [], summary: "Ready." });
    });
    expect(report.pass).toBe(true);
    expect(artifact.type === "carousel" && artifact.imagePaths.at(-1)).toContain("slide-09.png");
  });

  it("turns model-drafted article lists and emphasis into readable HTML", async () => {
    const dir = await fixtureDir();
    const artifact = SimpleArtifactSchema.parse({ type: "article", designVersion: 2, title: "An error log", sections: [{ title: "Record the miss", body: "Write down:\n\n1. **Topic:** The question area.\n2. **Fix:** One action.\n\nRetry later." }] });
    await renderModernArtifact(artifact, fixtureBrand(dir, true), dir);
    expect(artifact.type === "article" && artifact.html).toContain("<ol><li><strong>Topic:</strong>");
    expect(artifact.type === "article" && artifact.html).toContain("<p>Retry later.</p>");
  });
});
