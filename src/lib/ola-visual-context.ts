import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { projectDir } from "./paths";
import type { OlaTarget } from "./ola-edit";

/** Only read saved renders inside this project; client-supplied output paths are never trusted. */
export async function olaSavedPreviews(projectId: string, artifact: unknown, targets: OlaTarget[] = []) {
  if (!artifact || typeof artifact !== "object") return [];
  const value = artifact as { imagePath?: string; imagePaths?: string[]; previewPaths?: string[] };
  const files = value.imagePaths ?? value.previewPaths ?? (value.imagePath ? [value.imagePath] : []);
  const selected = targets.flatMap(target => target.path[0] === "slides" && typeof target.path[1] === "number" ? [target.path[1]] : []);
  const indexes = [...new Set([...selected, 0, Math.floor(files.length / 2), files.length - 1])].filter(index => index >= 0 && index < files.length).slice(0, 3);
  const root = await fs.realpath(projectDir(projectId)).catch(() => null);
  if (!root) return [];
  const previews = await Promise.all(indexes.map(async index => {
    try {
      const file = await fs.realpath(files[index]);
      if (!file.startsWith(root + path.sep)) return null;
      const bytes = await sharp(file).resize({ width: 700, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
      return { page: index + 1, url: `data:image/jpeg;base64,${bytes.toString("base64")}` };
    } catch { return null; }
  }));
  return previews.filter((preview): preview is { page: number; url: string } => Boolean(preview));
}
