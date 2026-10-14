import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { safeRemoteUrl } from "@/lib/internet-assets";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireMembership(id, "admin");
    const body = await request.json(); let url = await safeRemoteUrl(String(body.url ?? ""));
    let response: Response | undefined;
    for (let count = 0; count < 4; count++) {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "OlaBrandAnalyzer/1.0" } });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location"); if (!location) throw new Error("Invalid website redirect.");
      url = await safeRemoteUrl(new URL(location, url).toString());
    }
    if (!response?.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("The website did not return HTML.");
    const html = (await response.text()).slice(0, 200_000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]?.trim() ?? "";
    return NextResponse.json({ suggestions: { website: url.toString(), examples: [title, description].filter(Boolean) }, note: "Review these extracted website cues before applying. The brand profile was not changed." });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not analyze website." }, { status: 400 }); }
}
