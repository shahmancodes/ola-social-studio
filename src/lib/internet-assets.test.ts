import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { materializeInternetAssets, verifyDownloadableImage } from "./internet-assets";
import { ASSETS_DIR } from "./paths";
import type { Project } from "./schemas";

afterEach(() => vi.unstubAllGlobals());

describe("internet asset import", () => {
  it("rejects web pages masquerading as direct image URLs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>asset collection</html>", { headers: { "content-type": "text/html" } })));

    const result = await verifyDownloadableImage("https://1.1.1.1/collection");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("did not return an image");
  });

  it("accepts only decodable image bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not a PNG", { headers: { "content-type": "image/png" } })));

    const result = await verifyDownloadableImage("https://1.1.1.1/fake.png");

    expect(result.ok).toBe(false);
  });

  it("downloads an image even when usage permission is unverified", async () => {
    const id = `permission-test-${crypto.randomUUID()}`;
    const targetDir = path.join(ASSETS_DIR, "internet", id);
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#7f22fe" } }).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } })));

    try {
      const result = await materializeInternetAssets({ id } as Project, {
        summary: "Candidate to review",
        assets: [{
          title: "Test image",
          sourcePageUrl: "https://example.com/source",
          assetUrl: "https://1.1.1.1/test.png",
          publisher: "Example",
          recommendedRole: "supporting",
          canReplaceMascot: false,
          visualFit: "Supporting visual",
          usageRights: "permission-required",
          rightsEvidence: "Not verified; user will review before publication",
          attribution: "",
          accessedAt: new Date().toISOString(),
        }],
      });

      expect(result.assets[0].status).toBe("skipped");
      expect(result.assets[0].usageRights).toBe("permission-required");
      expect(result.assets[0].localPath).toBeUndefined();
      expect(result.summary).toContain("No external artwork was imported");
    } finally {
      await fs.rm(targetDir, { recursive: true, force: true });
    }
  });
});
