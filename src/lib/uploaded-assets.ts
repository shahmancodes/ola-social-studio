import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { invalidateAssetCatalog } from "./assets";
import { ASSETS_DIR } from "./paths";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp"]);

export async function saveUploadedAsset(file: File) {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("Choose an image smaller than 10 MB.");
  const source = Buffer.from(await file.arrayBuffer());
  let metadata;
  try {
    metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new Error("This file is not a supported image. Use PNG, JPEG, or WebP.");
  }
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) throw new Error("Use a PNG, JPEG, or WebP image.");
  const bytes = await sharp(source, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const stem = path.parse(file.name).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "image";
  const name = `${stem}-${randomUUID()}.png`;
  const directory = path.join(ASSETS_DIR, "uploads");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, name), bytes, { flag: "wx" });
  invalidateAssetCatalog();
  return `uploads/${name}`;
}
