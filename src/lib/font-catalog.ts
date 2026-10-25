/** Shared, client-safe font choices. Asset IDs always refer to company uploads. */
export const OTHER_FONTS = [
  { id: "sans", label: "Arial", family: "Arial" },
  { id: "helvetica", label: "Helvetica", family: "Helvetica" },
  { id: "serif", label: "Georgia", family: "Georgia" },
  { id: "times-new-roman", label: "Times New Roman", family: "Times New Roman" },
  { id: "verdana", label: "Verdana", family: "Verdana" },
  { id: "tahoma", label: "Tahoma", family: "Tahoma" },
  { id: "trebuchet", label: "Trebuchet MS", family: "Trebuchet MS" },
  { id: "mono", label: "Courier New", family: "Courier New" },
  { id: "impact", label: "Impact", family: "Impact" },
  { id: "inter", label: "Inter", family: "OlaInter", package: "@fontsource-variable/inter", file: "inter" },
  { id: "roboto", label: "Roboto", family: "OlaRoboto", package: "@fontsource-variable/roboto", file: "roboto" },
  { id: "open-sans", label: "Open Sans", family: "OlaOpenSans", package: "@fontsource-variable/open-sans", file: "open-sans" },
  { id: "lato", label: "Lato", family: "OlaLato", package: "@fontsource/lato", file: "lato", static: true },
  { id: "montserrat", label: "Montserrat", family: "OlaMontserrat", package: "@fontsource-variable/montserrat", file: "montserrat" },
  { id: "poppins", label: "Poppins", family: "OlaPoppins", package: "@fontsource/poppins", file: "poppins", static: true },
  { id: "manrope", label: "Manrope", family: "OlaManrope", package: "@fontsource-variable/manrope", file: "manrope" },
  { id: "merriweather", label: "Merriweather", family: "OlaMerriweather", package: "@fontsource-variable/merriweather", file: "merriweather" },
  { id: "playfair-display", label: "Playfair Display", family: "OlaPlayfair", package: "@fontsource-variable/playfair-display", file: "playfair-display" },
] as const;
export const EDITOR_FONT_IDS = ["brand-heading", "brand-body", ...OTHER_FONTS.map(f => f.id)] as const;
export type EditorFont = typeof EDITOR_FONT_IDS[number];
export type FontSelection = { font?: EditorFont; fontId?: string };
export type CompanyFont = { id: string; name: string };
export function customFontFamily(id: string) { return `OlaCustom${Array.from(id).map(c => c.codePointAt(0)!.toString(16)).join("")}`; }
export function fontFamily(selection: FontSelection) {
  if (selection.fontId) return customFontFamily(selection.fontId);
  if (selection.font === "brand-heading") return "OlaHeading";
  if (selection.font === "brand-body") return "OlaBody";
  return OTHER_FONTS.find(f => f.id === selection.font)?.family;
}
export function fontValue(selection: FontSelection) { return selection.fontId ? `asset:${selection.fontId}` : selection.font ?? ""; }
export function fontSelection(value: string): FontSelection { return value.startsWith("asset:") ? { fontId: value.slice(6), font: undefined } : { fontId: undefined, font: EDITOR_FONT_IDS.includes(value as EditorFont) ? value as EditorFont : undefined }; }
export function fontLabel(name: string) { return name.replace(/\.(woff2?|ttf|otf)$/i, "").replace(/[-_]/g, " "); }
export function bundledFontFile(id: string, weight = 400, italic = false) {
  const font = OTHER_FONTS.find(f => f.id === id);
  if (!font || !("package" in font)) return undefined;
  const style = italic && id !== "manrope" ? "italic" : "normal";
  return `${font.package}/files/${font.file}-latin-${"static" in font ? weight >= 600 ? 700 : 400 : "wght"}-${style}.woff2`;
}
