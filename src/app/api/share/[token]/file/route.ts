import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { projectForShareToken } from "@/lib/platform";
import { SimpleArtifactSchema } from "@/lib/simple-content";
import { DesignSpecSchema } from "@/lib/freeform-design";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params; const row = projectForShareToken(token);
    if (!row || row.status !== "complete") throw new Error("Expired or revoked.");
    const query = new URL(request.url).searchParams; const download = query.has("download");
    if (!row.artifact_json) throw new Error("No artifact.");
    if (row.content_type === "design") {
      const design = DesignSpecSchema.parse(JSON.parse(row.artifact_json));
      const svg = query.get("format") === "svg";
      const file = svg ? design.svgPath : design.imagePath;
      if (!file) throw new Error("No design export.");
      return new Response(new Uint8Array(await fs.readFile(file)), { headers: { "content-type": svg ? "image/svg+xml" : "image/png", "cache-control": "private, no-store", ...(download ? { "content-disposition": `attachment; filename="design.${svg ? "svg" : "png"}"` } : {}) } });
    }
    const artifact = SimpleArtifactSchema.parse(JSON.parse(row.artifact_json));
    if (artifact.type === "article") return new Response(artifact.markdown ?? "", { headers: { "content-type": "text/markdown", "content-disposition": "attachment; filename=article.md" } });
    if (artifact.type === "carousel") {
      if (!download) { const index = Number(query.get("slide")) - 1; if (!Number.isInteger(index) || !artifact.imagePaths[index]) throw new Error("Slide not found."); return new Response(new Uint8Array(await fs.readFile(artifact.imagePaths[index])), { headers: { "content-type": "image/png", "cache-control": "private, no-store" } }); }
      const zip = new JSZip(); for (const file of artifact.imagePaths) zip.file(path.basename(file), await fs.readFile(file)); zip.file("caption.txt", artifact.caption);
      return new Response(new Uint8Array(await zip.generateAsync({ type: "uint8array" })), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${row.id}.zip"` } });
    }
    const file = artifact.type === "post" || artifact.type === "story" || artifact.type === "poster" ? artifact.imagePath : artifact.pptxPath;
    if (!file) throw new Error("No export.");
    const type = artifact.type === "post" || artifact.type === "story" || artifact.type === "poster" ? "image/png" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    return new Response(new Uint8Array(await fs.readFile(file)), { headers: { "content-type": type, ...(download ? { "content-disposition": `attachment; filename="${artifact.type === "post" ? "post.png" : artifact.type === "story" ? "instagram-story.png" : artifact.type === "poster" ? "poster-a4.png" : "presentation.pptx"}"` } : {}) } });
  } catch { return NextResponse.json({ error: "Link expired or file unavailable." }, { status: 404 }); }
}
