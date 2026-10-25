"use client";
import { OTHER_FONTS, customFontFamily, type CompanyFont, type FontSelection, fontFamily } from "@/lib/font-catalog";

export function EditorFonts({ companyId, fonts }: { companyId: string; fonts: CompanyFont[] }) {
  const faces = OTHER_FONTS.filter(f => "package" in f).flatMap(f => [400, 700].flatMap(weight => (f.id === "manrope" ? ["normal"] : ["normal", "italic"]).map(style => `@font-face{font-family:${f.family};src:url(/api/fonts/${f.id}?weight=${weight}&style=${style});font-weight:${weight};font-style:${style};font-display:block}`)));
  faces.push(...fonts.map(font => `@font-face{font-family:${customFontFamily(font.id)};src:url(/api/companies/${encodeURIComponent(companyId)}/assets/${encodeURIComponent(font.id)});font-weight:100 900;font-style:normal;font-display:block}`));
  return <style>{faces.join("")}</style>;
}
export async function loadEditorFont(selection: FontSelection) {
  const family = fontFamily(selection) ?? "OlaBody";
  await Promise.all([false, true].flatMap(slant => [400, 700].map(weight => document.fonts.load(`${slant ? "italic" : "normal"} ${weight} 24px "${family}"`))));
  return family;
}
