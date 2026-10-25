import { readBundledFont } from "@/lib/editor-font-files";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ font: string }> }) {
  const { font } = await context.params;
  const query = new URL(request.url).searchParams;
  try {
    const bytes = await readBundledFont(font, query.get("weight") === "700" ? 700 : 400, query.get("style") === "italic");
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=86400" } });
  } catch { return new Response("Font not found.", { status: 404 }); }
}
