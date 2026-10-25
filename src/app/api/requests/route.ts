import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { inferContentType } from "@/lib/intake";
import { comingSoonError, isActiveFormat } from "@/lib/format-availability";
import { CreativeBriefSchema, guidedBrief } from "@/lib/creative-brief";
import { createCreativeRequest, prepareBriefReferences } from "@/lib/creative-request";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    let body: unknown;
    let files: File[] = [];
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("brief")));
      files = form.getAll("references").filter((file): file is File => file instanceof File && file.size > 0);
    } else body = await request.json();
    const input = CreativeBriefSchema.parse(body);
    const { user } = await requireMembership(input.companyId);
    const explicit = inferContentType(guidedBrief(input));
    if (explicit && !isActiveFormat(explicit)) return NextResponse.json(comingSoonError(explicit), { status: 422 });
    const references = await prepareBriefReferences(files);
    return NextResponse.json({ id: await createCreativeRequest(input, user.id, references) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start request." }, { status: 400 }); }
}
