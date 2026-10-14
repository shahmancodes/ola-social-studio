"use client";

import Image from "next/image";
import type { Brand } from "@/lib/platform";
import { buildBrandGuideSvg, paletteForBrand } from "@/lib/brand-guide-svg";
import styles from "./brand-guide.module.css";

async function assetDataUrl(companyId: string, assetId: string | null | undefined) {
  if (!assetId) return "";
  const response = await fetch(`/api/companies/${companyId}/assets/${assetId}`);
  if (!response.ok) return "";
  const blob = await response.blob();
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

export async function exportBrandGuide(companyId: string, companyName: string, brand: Brand) {
  if (!brand.themeCard) return;
  const [logo, wordmark, font] = await Promise.all([
    assetDataUrl(companyId, brand.logoAssetId),
    assetDataUrl(companyId, brand.wordmarkAssetId),
    assetDataUrl(companyId, brand.fontAssetIds[0]),
  ]);
  const svg = buildBrandGuideSvg(companyName, brand, logo, wordmark, font);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-brand-guide.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BrandGuide({ companyId, companyName, brand }: { companyId: string; companyName: string; brand: Brand }) {
  const card = brand.themeCard;
  if (!card) return null;
  const colors = paletteForBrand(brand);
  const fontAssetId = brand.fontAssetIds.find((id) => /^[a-f0-9-]{36}$/i.test(id));
  const fontFamily = `guide-font-${companyId.replace(/[^a-z0-9]/gi, "")}`;
  return <article className={styles.guide} aria-label={`${companyName} brand guide`}>
    {fontAssetId && <style>{`@font-face{font-family:"${fontFamily}";src:url("/api/companies/${encodeURIComponent(companyId)}/assets/${fontAssetId}");font-display:swap}`}</style>}
    <header className={styles.header}><div><span className={styles.overline}>Brand guide</span><h2>{companyName}</h2></div><span className={styles.headerNote}>Visual and verbal identity</span></header>

    <section className={styles.section} aria-labelledby="guide-logo"><div className={styles.sectionIntro}><span>01 / Identity</span><h3 id="guide-logo">Logo</h3><p>The primary mark for your brand.</p></div><div className={styles.sectionBody}>
      <div className={styles.markStage}>{brand.logoAssetId ? <Image src={`/api/companies/${companyId}/assets/${brand.logoAssetId}`} alt={`${companyName} logo`} width={620} height={250} unoptimized className={styles.markImage} /> : <span className={styles.missingMark}>No logo uploaded</span>}</div>
    </div></section>

    {brand.wordmarkAssetId && <section className={styles.section} aria-labelledby="guide-wordmark"><div className={styles.sectionIntro}><span>02 / Identity</span><h3 id="guide-wordmark">Wordmark</h3><p>The name as a separate brand asset.</p></div><div className={styles.sectionBody}><div className={`${styles.markStage} ${styles.wordmarkStage}`}><Image src={`/api/companies/${companyId}/assets/${brand.wordmarkAssetId}`} alt={`${companyName} wordmark`} width={620} height={170} unoptimized className={styles.markImage} /></div></div></section>}

    <section className={styles.section} aria-labelledby="guide-colors"><div className={styles.sectionIntro}><span>{brand.wordmarkAssetId ? "03" : "02"} / Palette</span><h3 id="guide-colors">Color themes</h3><p>Use these colors consistently across materials.</p></div><div className={styles.sectionBody}>
      {colors.length ? <div className={styles.paletteGrid}>{colors.map(({ color, label }) => <div className={styles.swatch} key={label}><div className={styles.swatchColor} style={{ backgroundColor: color }} /><div className={styles.swatchMeta}><span>{label}</span><code>{color}</code></div></div>)}</div> : <p className={styles.emptyDetail}>Add colors in Brand details to build your palette.</p>}
    </div></section>

    <section className={styles.section} aria-labelledby="guide-typography"><div className={styles.sectionIntro}><span>{brand.wordmarkAssetId ? "04" : "03"} / Type</span><h3 id="guide-typography">Typography</h3><p>How your brand uses type.</p></div><div className={styles.sectionBody}>{fontAssetId ? <div className={styles.typeSample} style={{ fontFamily: `"${fontFamily}", sans-serif` }} aria-hidden="true"><strong>Aa</strong><span>ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />abcdefghijklmnopqrstuvwxyz<br />0123456789</span></div> : <div className={styles.typeMissing}>Upload a font file to preview its letterforms.</div>}<p className={styles.guidance}>{card.typography || "Add a font or generate a guide to define your typography."}</p></div></section>

    <section className={styles.section} aria-labelledby="guide-voice"><div className={styles.sectionIntro}><span>{brand.wordmarkAssetId ? "05" : "04"} / Language</span><h3 id="guide-voice">Voice</h3><p>How the brand sounds in words.</p></div><div className={styles.sectionBody}><p className={styles.voiceStatement}>{brand.voice || "Add voice guidance in Brand details to define how your company speaks."}</p>{card.personality.length > 0 && <div className={styles.traits}>{card.personality.map((trait, index) => <span key={`${trait}-${index}`}>{trait}</span>)}</div>}{brand.formatRules && <p className={styles.formatRules}>{brand.formatRules}</p>}</div></section>

    <footer className={styles.footer}><span>{companyName} · Brand guide</span><span>Updated {card.generatedAt.slice(0, 10)}</span></footer>
  </article>;
}
