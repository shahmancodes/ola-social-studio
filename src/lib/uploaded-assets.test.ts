import { describe, expect, it } from "vitest";
import { saveUploadedAsset } from "./uploaded-assets";

describe("computer asset uploads", () => {
  it("rejects unsupported SVG files", async () => {
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "drawing.svg", { type: "image/svg+xml" });
    await expect(saveUploadedAsset(file)).rejects.toThrow("Use PNG, JPEG, or WebP");
  });

  it("rejects files over the upload limit before reading them", async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    await expect(saveUploadedAsset(file)).rejects.toThrow("smaller than 10 MB");
  });
});
