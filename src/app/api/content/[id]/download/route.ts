import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { SimpleArtifactSchema } from "@/lib/simple-content";
import { DesignSpecSchema } from "@/lib/freeform-design";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireProjectAccess(id);
    const row = projectRow(id); if (!row || !["complete", "needs-review"].includes(row.status) || !row.artifact_json) throw new Error("Not ready.");
    if (row.content_type === "design") {
      const design = DesignSpecSchema.parse(JSON.parse(row.artifact_json));
      const svg = new URL(request.url).searchParams.get("format") === "svg";
      const file = svg ? design.svgPath : design.imagePath;
      if (!file) throw new Error("Export missing.");
      return new Response(new Uint8Array(await fs.readFile(file)), { headers: { "content-type": svg ? "image/svg+xml" : "image/png", "content-disposition": `attachment; filename="design.${svg ? "svg" : "png"}"` } });
    }
    const artifact = SimpleArtifactSchema.parse(JSON.parse(row.artifact_json));
    const format = new URL(request.url).searchParams.get("format");
    let filename: string; let mime: string; let file: string;
    if (artifact.type === "post" && artifact.imagePath) { filename = "post.png"; mime = "image/png"; file = artifact.imagePath; }
    else if (artifact.type === "story" && artifact.imagePath) { filename = "instagram-story.png"; mime = "image/png"; file = artifact.imagePath; }
    else if (artifact.type === "presentation" && artifact.pptxPath) { filename = "presentation.pptx"; mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation"; file = artifact.pptxPath; }
    else if (artifact.type === "carousel") { const zip = new JSZip(); for (const file of artifact.imagePaths) zip.file(path.basename(file), await fs.readFile(file)); zip.file("caption.txt", artifact.caption); return new Response(new Uint8Array(await zip.generateAsync({ type: "uint8array" })), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${id}.zip"` } }); }
    else if (artifact.type === "article") { filename = format === "html" ? "article.html" : "article.md"; mime = format === "html" ? "text/html" : "text/markdown"; file = `${artifact.type === "article" ? artifact.html : ""}`; const text = format === "html" ? artifact.html : artifact.markdown; return new Response(text, { headers: { "content-type": `${mime}; charset=utf-8`, "content-disposition": `attachment; filename="${filename}"` } }); }
    else throw new Error("Export missing.");
    return new Response(new Uint8Array(await fs.readFile(file)), { headers: { "content-type": mime, "content-disposition": `attachment; filename="${filename}"` } });
  } catch { return NextResponse.json({ error: "Export unavailable." }, { status: 404 }); }
}
