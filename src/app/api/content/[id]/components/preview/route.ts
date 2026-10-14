import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { SemanticComponentSchema } from "@/lib/schemas";
import { renderSemanticComponentPng } from "@/lib/semantic-component-image";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireProjectAccess(id);
    const project = projectRow(id);
    if (project?.content_type !== "design") throw new Error("This project is not a free-form design.");
    const body = await request.text();
    if (body.length > 20_000) throw new Error("Component data is too large.");
    const component = SemanticComponentSchema.parse(JSON.parse(body));
    const brand = JSON.parse(project.brand_snapshot_json) as { colors?: string[] };
    const png = await renderSemanticComponentPng(component, brand.colors?.[1] ?? brand.colors?.[0], project.company_id);
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not render component." }, { status: 400 });
  }
}
