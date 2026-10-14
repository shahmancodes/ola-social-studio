import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { getBrand, getCompany } from "@/lib/platform";
import { contentBrand } from "@/lib/content-brand";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireProjectAccess(id);
    const row = projectRow(id); if (!row) throw new Error("Project missing.");
    const brand = contentBrand(row.company_id, getCompany(row.company_id)?.name ?? "Company", getBrand(row.company_id), row.brief);
    return NextResponse.json({ assets: brand.assets.map(({ id: assetId, name }) => ({ id: assetId, name })) });
  } catch { return NextResponse.json({ error: "Assets unavailable." }, { status: 404 }); }
}
