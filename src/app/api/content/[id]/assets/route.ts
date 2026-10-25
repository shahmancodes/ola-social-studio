import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/platform-auth";
import { db, projectRow } from "@/lib/platform-db";
import { getBrand, getCompany } from "@/lib/platform";
import { contentBrand } from "@/lib/content-brand";
import { sceneFontCss } from "@/lib/scene-renderer";
import {companyFontChoices} from '@/lib/editor-font-files';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await requireProjectAccess(id);
    const row = projectRow(id); if (!row) throw new Error("Project missing.");
    const brand = contentBrand(row.company_id, getCompany(row.company_id)?.name ?? "Company", getBrand(row.company_id), row.brief,id);
    const library = db().prepare("SELECT id,name,source_url,rights_note FROM assets WHERE company_id=? AND media_type IN ('image/png','image/jpeg','image/webp','image/svg+xml') AND category!='project-artwork' ORDER BY created_at DESC").all(row.company_id) as Array<{id:string;name:string;source_url:string|null;rights_note:string|null}>;
    const assets=[...new Map([...library.filter(a=>!a.source_url||Boolean(a.rights_note&&!/unverified|permission.required|unknown|not verified/i.test(a.rights_note))),...brand.assets].map(a=>[a.id,{id:a.id,name:a.name}])).values()];
    return NextResponse.json({ assets, fonts: await companyFontChoices(brand.fonts), fontCss: await sceneFontCss({ width: 1, height: 1, background: "#FFFFFF", elements: [], fonts: brand.fonts }) });
  } catch { return NextResponse.json({ error: "Assets unavailable." }, { status: 404 }); }
}
