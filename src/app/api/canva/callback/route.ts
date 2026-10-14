import { NextResponse } from "next/server";
import { requireUser, roleFor } from "@/lib/platform-auth";
import { finishCanvaConnect, pendingCanvaCompany } from "@/lib/canva";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url);
  let companyId: string | undefined;
  try {
    const user = await requireUser();
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    companyId = state ? pendingCanvaCompany(state, user.id) : undefined;
    if (!state || !code) throw new Error("Canva connection was cancelled.");
    companyId = await finishCanvaConnect(state, code, user.id);
    if (!roleFor(user.id, companyId)) throw new Error("Access denied.");
    return NextResponse.redirect(new URL(`/companies/${companyId}/onboarding?step=4&canva=connected`, url.origin));
  } catch (error) {
    const destination = new URL(companyId ? `/companies/${companyId}/onboarding?step=4` : "/workspace", url.origin);
    destination.searchParams.set("canvaError", error instanceof Error ? error.message : "Canva connection failed.");
    return NextResponse.redirect(destination);
  }
}
