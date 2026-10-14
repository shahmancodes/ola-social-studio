import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { getBrand, saveBrand } from "@/lib/platform";
export const runtime = "nodejs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireMembership(id); return NextResponse.json({ brand: getBrand(id) }); }
  catch { return NextResponse.json({ error: "Access denied." }, { status: 403 }); }
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await requireMembership(id, "admin"); return NextResponse.json({ brand: saveBrand(id, await request.json()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save brand." }, { status: 400 }); }
}
