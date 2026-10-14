import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { getCompany, saveOnboardingCompany } from "@/lib/platform";
import { OnboardingBrandSchema, parseCompanyName } from "@/lib/company-onboarding";

export const runtime = "nodejs";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireMembership(id, "admin");
    const company = getCompany(id);
    if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
    const body = await request.json();
    const name = parseCompanyName(body.name);
    const brand = OnboardingBrandSchema.parse(body.brand);
    const step = Number(body.step);
    const saved = saveOnboardingCompany(id, name, brand, step);
    return NextResponse.json({ brand: saved, step });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save setup." }, { status: 400 }); }
}
