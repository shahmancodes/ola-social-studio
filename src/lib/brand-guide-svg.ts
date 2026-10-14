import type { Brand } from "./platform";

export function paletteForBrand(brand: Brand) {
  return brand.colors.filter((color) => /^#[0-9a-f]{6}$/i.test(color)).map((color, index) => ({ label: `Color ${String(index + 1).padStart(2, "0")}`, color: color.toUpperCase() }));
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function wrapLines(value: string, maxChars: number) {
  const lines: string[] = [];
  let current = "";
  for (const original of value.split(/\s+/).filter(Boolean)) {
    let word = original;
    while (word.length > maxChars) {
      if (current) { lines.push(current); current = ""; }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function textLines(lines: string[], x: number, y: number, lineHeight: number, className: string) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`).join("");
}

function sectionTitle(index: number, category: string, title: string, top: number) {
  return `<text x="64" y="${top + 19}" class="overline">${String(index).padStart(2, "0")} / ${category}</text><text x="64" y="${top + 59}" class="sectionTitle">${escapeXml(title)}</text>`;
}

function divider(y: number) {
  return `<line x1="64" x2="1136" y1="${y}" y2="${y}" stroke="#eae6eb"/>`;
}

export function buildBrandGuideSvg(companyName: string, brand: Brand, logo: string, wordmark: string, font = "") {
  if (!brand.themeCard) throw new Error("Brand guide is not ready.");
  const colors = paletteForBrand(brand);
  const hasWordmark = Boolean(brand.wordmarkAssetId);
  const nameLines = wrapLines(companyName, 34);
  const headerBottom = 170 + Math.max(0, nameLines.length - 1) * 50;
  const logoTop = headerBottom + 34;
  const wordmarkTop = logoTop + 290;
  const paletteTop = hasWordmark ? wordmarkTop + 240 : wordmarkTop;
  const paletteRows = Math.max(1, Math.ceil(colors.length / 4));
  const paletteBottom = paletteTop + 40 + paletteRows * 180;
  const typographyTop = paletteBottom + 24;
  const typography = brand.themeCard.typography || "Add a font or generate a guide to define your typography.";
  const typographyLines = wrapLines(typography, 74);
  const typographyBottom = Math.max(typographyTop + 267, typographyTop + 178 + (typographyLines.length - 1) * 27 + 40);
  const voiceTop = typographyBottom + 27;
  const voice = brand.voice || "Add voice guidance in Brand details to define how your company speaks.";
  const voiceLines = wrapLines(voice, 56);
  const voiceTextBottom = voiceTop + 54 + (voiceLines.length - 1) * 36;
  const traits = brand.themeCard.personality.slice(0, 4).join(" · ");
  const traitsY = voiceTextBottom + 48;
  const formatLines = wrapLines(brand.formatRules, 88);
  const formatY = traits ? traitsY + 43 : voiceTextBottom + 48;
  const contentBottom = formatLines.length ? formatY + (formatLines.length - 1) * 24 : traits ? traitsY : voiceTextBottom;
  const footerTop = Math.max(voiceTop + 260, contentBottom + 65);
  const height = footerTop + 68;

  const swatches = colors.length ? colors.map((item, index) => {
    const x = 350 + (index % 4) * 200;
    const y = paletteTop + 11 + Math.floor(index / 4) * 180;
    return `<rect x="${x}" y="${y}" width="187" height="112" rx="6" fill="${item.color}" stroke="#e7e2e7"/><text x="${x}" y="${y + 138}" class="smallBold">${item.label}</text><text x="${x}" y="${y + 160}" class="meta">${item.color}</text>`;
  }).join("") : `<text x="350" y="${paletteTop + 50}" class="body">Add brand colors to build your palette.</text>`;
  const logoImage = logo ? `<image href="${escapeXml(logo)}" x="385" y="${logoTop + 33}" width="710" height="164" preserveAspectRatio="xMidYMid meet"/>` : `<text x="743" y="${logoTop + 121}" class="placeholder" text-anchor="middle">No logo uploaded</text>`;
  const wordmarkImage = wordmark ? `<image href="${escapeXml(wordmark)}" x="389" y="${wordmarkTop + 34}" width="708" height="102" preserveAspectRatio="xMidYMid meet"/>` : `<text x="743" y="${wordmarkTop + 91}" class="placeholder" text-anchor="middle">Wordmark unavailable</text>`;
  const wordmarkSection = hasWordmark ? `${sectionTitle(2, "IDENTITY", "Wordmark", wordmarkTop)}<text x="64" y="${wordmarkTop + 86}" class="meta">Separate name asset</text><rect x="350" y="${wordmarkTop}" width="786" height="170" rx="8" fill="#faf9fa" stroke="#eae7ea"/>${wordmarkImage}${divider(wordmarkTop + 211)}` : "";
  const typeSpecimen = font ? `<text x="350" y="${typographyTop + 127}" class="specimen">Aa</text><text x="550" y="${typographyTop + 52}" class="alphabet">ABCDEFGHIJKLMNOPQRSTUVWXYZ</text><text x="550" y="${typographyTop + 82}" class="alphabet">abcdefghijklmnopqrstuvwxyz</text><text x="550" y="${typographyTop + 112}" class="alphabet">0123456789</text>` : `<text x="350" y="${typographyTop + 100}" class="meta">Upload a font file to preview its letterforms.</text>`;
  const fontRule = font ? `@font-face{font-family:GuideBrandFont;src:url("${escapeXml(font)}")}` : "";
  const css = `${fontRule}text{font-family:Arial,Helvetica,sans-serif;fill:#231e25}.overline{font-size:13px;font-weight:700;letter-spacing:2px;fill:#857b87}.company{font-size:${companyName.length > 26 ? 42 : 52}px;font-weight:700;letter-spacing:-2px}.sectionTitle{font-size:32px;font-weight:700;letter-spacing:-1px}.meta{font-size:16px;fill:#8a808d}.body{font-size:19px;fill:#504851}.smallBold{font-size:16px;font-weight:700;fill:#6d6470}.placeholder{font-size:18px;fill:#948b96}.specimen{font-family:GuideBrandFont,Arial,Helvetica,sans-serif;font-size:116px;font-weight:700;letter-spacing:-9px}.alphabet{font-family:GuideBrandFont,Arial,Helvetica,sans-serif;font-size:18px;letter-spacing:1px;fill:#645c67}.voice{font-size:25px;fill:#302a32}`;
  const sections = [
    `<text x="64" y="72" class="overline">BRAND GUIDE</text>${textLines(nameLines, 64, 139, 50, "company")}<text x="1136" y="72" class="meta" text-anchor="end">VISUAL AND VERBAL IDENTITY</text>${divider(headerBottom)}`,
    `${sectionTitle(1, "IDENTITY", "Logo", logoTop)}<text x="64" y="${logoTop + 87}" class="meta">Primary brand mark</text><rect x="350" y="${logoTop}" width="786" height="232" rx="8" fill="#faf9fa" stroke="#eae7ea"/>${logoImage}${divider(logoTop + 261)}`,
    wordmarkSection,
    `${sectionTitle(hasWordmark ? 3 : 2, "PALETTE", "Color themes", paletteTop)}${swatches}${divider(paletteBottom)}`,
    `${sectionTitle(hasWordmark ? 4 : 3, "TYPE", "Typography", typographyTop)}${typeSpecimen}${textLines(typographyLines, 350, typographyTop + 178, 27, "body")}${divider(typographyBottom)}`,
    `${sectionTitle(hasWordmark ? 5 : 4, "LANGUAGE", "Voice", voiceTop)}${textLines(voiceLines, 350, voiceTop + 54, 36, "voice")}${traits ? `<text x="350" y="${traitsY}" class="smallBold">${escapeXml(traits)}</text>` : ""}${textLines(formatLines, 350, formatY, 24, "meta")}${divider(footerTop)}`,
    `<text x="64" y="${footerTop + 38}" class="meta">Brand guide</text><text x="1136" y="${footerTop + 38}" class="meta" text-anchor="end">${escapeXml(brand.themeCard.generatedAt.slice(0, 10))}</text>`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 ${height}" width="1200" height="${height}"><style>${css}</style><rect width="1200" height="${height}" fill="#fff"/>${sections.join("")}</svg>`;
}
