import fs from "node:fs/promises";
import { chromium } from "playwright";
import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/platform-auth";
import { getBrand, getCompany, getCompanyAsset } from "@/lib/platform";
import { buildBrandGuideSvg } from "@/lib/brand-guide-svg";

export const runtime = "nodejs";

async function embeddedAsset(companyId: string, assetId: string | null | undefined) {
  if (!assetId) return "";
  const asset = getCompanyAsset(companyId, assetId);
  if (!asset || !asset.media_type.startsWith("image/")) return "";
  const bytes = await fs.readFile(asset.disk_path).catch(() => null);
  return bytes ? `data:${asset.media_type};base64,${bytes.toString("base64")}` : "";
}

async function embeddedFont(companyId: string, assetId: string | undefined) {
  if (!assetId) return "";
  const asset = getCompanyAsset(companyId, assetId);
  if (!asset || !asset.media_type.startsWith("font/")) return "";
  const bytes = await fs.readFile(asset.disk_path).catch(() => null);
  return bytes ? `data:${asset.media_type};base64,${bytes.toString("base64")}` : "";
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { await requireMembership(id); }
  catch { return NextResponse.json({ error: "Access denied." }, { status: 403 }); }
  try {
    const company = getCompany(id);
    const brand = getBrand(id);
    if (!company || !brand.themeCard) return NextResponse.json({ error: "Brand guide is not ready." }, { status: 404 });
    const [logo, wordmark, font] = await Promise.all([
      embeddedAsset(id, brand.logoAssetId),
      embeddedAsset(id, brand.wordmarkAssetId),
      embeddedFont(id, brand.fontAssetIds[0]),
    ]);
    const svg = buildBrandGuideSvg(company.name, brand, logo, wordmark, font);
    const height = Number(svg.match(/<svg[^>]*height="(\d+)"/)?.[1] ?? 1700);
    const browser = await chromium.launch({ headless: true });
    let pdf: Uint8Array;
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1200px;height:${height}px}svg{display:block}</style></head><body>${svg}</body></html>`, { waitUntil: "load" });
      pdf = await page.pdf({ width: "1200px", height: `${height}px`, margin: { top: "0", right: "0", bottom: "0", left: "0" }, printBackground: true });
    } finally { await browser.close(); }
    const filename = `${company.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-brand-guide.pdf`;
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not export PDF." }, { status: 500 });
  }
}
