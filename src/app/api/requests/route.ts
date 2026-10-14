import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMembership } from "@/lib/platform-auth";
import { createIntakeRequest, inferContentType } from "@/lib/intake";
import { comingSoonError, isActiveFormat } from "@/lib/format-availability";

const Input = z.object({ companyId: z.string().uuid(), brief: z.string().trim().min(3).max(5000) });
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = Input.parse(await request.json());
    const { user } = await requireMembership(input.companyId);
    const explicit = inferContentType(input.brief);
    if (explicit && !isActiveFormat(explicit)) return NextResponse.json(comingSoonError(explicit), { status: 422 });
    return NextResponse.json({ id: createIntakeRequest(input.companyId, user.id, input.brief) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start request." }, { status: 400 }); }
}
