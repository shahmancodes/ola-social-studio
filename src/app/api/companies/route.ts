import { NextResponse } from "next/server";
import { requireUser } from "@/lib/platform-auth";
import { companiesForUser, createOnboardingCompany } from "@/lib/platform";
import { OnboardingBrandSchema, parseCompanyName } from "@/lib/company-onboarding";
export const runtime = "nodejs";
export async function GET() {
  try { const user = await requireUser(); return NextResponse.json({ companies: companiesForUser(user.id) }); }
  catch { return NextResponse.json({ error: "Sign in required." }, { status: 401 }); }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const name = parseCompanyName(body.name);
    const brand = OnboardingBrandSchema.parse(body.brand);
    const companyId = createOnboardingCompany(name, user.id, brand);
    return NextResponse.json({ companyId }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create company." }, { status: 400 }); }
}
