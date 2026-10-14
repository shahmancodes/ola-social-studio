import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { canvaRequest } from "@/lib/canva";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireMembership(id, "admin");
    const input = new URL(request.url).searchParams;
    const query = new URLSearchParams({ limit: "24", sort_by: "modified_descending" });
    if (input.get("query")) query.set("query", input.get("query")!.slice(0, 100));
    if (input.get("continuation")) query.set("continuation", input.get("continuation")!.slice(0, 1000));
    const result = await canvaRequest(id, user.id, `designs?${query}`);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Canva designs." }, { status: 400 }); }
}
