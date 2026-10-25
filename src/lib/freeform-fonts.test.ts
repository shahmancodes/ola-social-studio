import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const data = await fs.mkdtemp(path.join(os.tmpdir(), "ola-font-test-"));
vi.stubEnv("OLA_DATA_DIR", data);
const platform = await import("./platform");
const auth = await import("./platform-auth");
const { db, projectRow } = await import("./platform-db");
const { DesignSpecSchema, saveDesignSpec } = await import("./freeform-design");
let companyId: string, projectId: string, fontId: string;
beforeAll(async () => {
  const user = auth.createUser("fonts@example.test", "test-font-password-123");
  companyId = platform.createCompany("Font Studio", user);
  fontId = await platform.storeCompanyAsset(companyId, "Brand-Manrope.woff2", await fs.readFile(path.join(process.cwd(), "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2")), "font/woff2", "font");
  platform.saveBrand(companyId, { ...platform.getBrand(companyId), fontAssetIds: [fontId] });
  projectId = platform.createProjectRecord({ companyId, creatorId: user, contentType: "design", brief: "Check font exports" });
});
afterAll(async () => { db().close(); vi.unstubAllEnvs(); await fs.rm(data, { recursive: true, force: true }); });
const base = { type: "design", title: "Typography", includeLogo: false, background: "#FFFFFF", size: { label: "Digital", widthPx: 650, heightPx: 500 }, elements: [{ id: "headline", kind: "text", text: "One clear idea\nA second line", x: .1, y: .1, width: .6, fontSize: .06, color: "#111111", weight: "bold" }] };
describe("free-form font export", () => {
  it("saves company fonts in the design, SVG and rendered PNG", async () => {
    await saveDesignSpec(projectId, { ...base, elements: [{ ...base.elements[0], fontId }] });
    const artifact = DesignSpecSchema.parse(JSON.parse(projectRow(projectId)!.artifact_json!));
    expect(artifact.elements[0]).toHaveProperty("fontId", fontId);
    const svg = await fs.readFile(artifact.svgPath!, "utf8");
    expect(svg).toContain("OlaCustom"); expect(svg).toContain("data:font/woff2;base64,");
    expect(svg).toContain("A second line");
    expect(await sharp(artifact.imagePath!).metadata()).toMatchObject({ width: 650, height: 500 });
  });
  it("switches to a bundled font and retains it through reload and export", async () => {
    const previous = await fs.readFile(DesignSpecSchema.parse(JSON.parse(projectRow(projectId)!.artifact_json!)).imagePath!);
    await saveDesignSpec(projectId, { ...base, elements: [{ ...base.elements[0], font: "playfair-display", italic: true }] }, projectRow(projectId)!.version);
    const artifact = DesignSpecSchema.parse(JSON.parse(projectRow(projectId)!.artifact_json!));
    expect(artifact.elements[0]).toMatchObject({ font: "playfair-display", italic: true });
    expect(await fs.readFile(artifact.svgPath!, "utf8")).toContain("OlaPlayfair");
    expect((await fs.readFile(artifact.imagePath!)).equals(previous)).toBe(false);
  });
  it("rejects foreign font IDs without changing the saved design", async () => {
    const version = projectRow(projectId)!.version;
    await expect(saveDesignSpec(projectId, { ...base, elements: [{ ...base.elements[0], fontId: "other-company-font" }] }, version)).rejects.toThrow(/company/);
    expect(projectRow(projectId)!.version).toBe(version);
  });
});
