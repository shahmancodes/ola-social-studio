"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Brand } from "@/lib/platform";
import { ArrowRightIcon } from "./ui-icons";
import { PageHeader } from "@/components/page-header";
import styles from "./company-onboarding.module.css";

type Design = { id: string; title?: string; thumbnail?: { url: string }; page_count?: number };
type Props = { companyId?: string; initialName: string; initialBrand: Brand; initialStep: number; canvaConfigured: boolean; canvaConnected: boolean; canvaJustConnected?: boolean; canvaError?: string };
const steps = ["Company", "Links", "Creative direction", "Canva"];
const socialNames = ["Instagram", "TikTok", "LinkedIn", "YouTube", "Twitter"];

function validUrl(value: string) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

export function CompanyOnboarding({ companyId: initialCompanyId, initialName, initialBrand, initialStep, canvaConfigured, canvaConnected, canvaJustConnected, canvaError }: Props) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState(initialBrand);
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(canvaError || (canvaJustConnected ? "Canva connected. Choose designs to use as references, or finish setup." : ""));
  const [designs, setDesigns] = useState<Design[]>([]);
  const [query, setQuery] = useState("");
  const [continuation, setContinuation] = useState("");
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!companyId || !canvaConnected || step !== 4) return;
    void loadDesigns();
    // Initial load follows the server-provided Canva connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, canvaConnected, step]);

  function cleanBrand() {
    return {
      ...brand,
      description: brand.description.trim(), website: brand.website.trim(), audience: brand.audience.trim(), voice: brand.voice.trim(),
      formatRules: brand.formatRules.trim(), examples: brand.examples.map((item) => item.trim()).filter(Boolean),
      colors: brand.colors.map((item) => item.trim().toUpperCase()).filter(Boolean),
      socialLinks: brand.socialLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label || link.url),
    };
  }

  async function save(nextStep: number) {
    const clean = cleanBrand();
    if (!name.trim()) throw new Error("Enter your company name.");
    if (clean.website && !validUrl(clean.website)) throw new Error("Enter a valid website URL starting with https://.");
    if (clean.socialLinks.some((link) => !link.label || !validUrl(link.url))) throw new Error("Each added link needs a name and a valid URL.");
    if (clean.colors.some((color) => !/^#[0-9A-F]{6}$/.test(color))) throw new Error("Use six-digit color codes such as #6A4C93.");
    const response = await fetch(companyId ? `/api/companies/${companyId}/onboarding` : "/api/companies", {
      method: companyId ? "PUT" : "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(companyId ? { name: name.trim(), brand: clean, step: nextStep } : { name: name.trim(), brand: clean }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not save company setup.");
    setBrand(clean);
    if (!companyId) { setCompanyId(result.companyId); router.replace(`/companies/${result.companyId}/onboarding?step=${nextStep}`); }
    return result.companyId ?? companyId;
  }

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const nextStep = Math.min(step + 1, 4);
      const id = await save(nextStep);
      if (step === 3 && selectedFiles.length && id) await uploadFiles(id);
      setStep(nextStep);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save setup."); }
    finally { setBusy(false); }
  }

  async function uploadFiles(id: string) {
    const updated = { ...brand, fontAssetIds: [...brand.fontAssetIds] };
    for (const file of selectedFiles) {
      const category = /\.(woff2?|ttf|otf)$/i.test(file.name) ? "font" : /logo/i.test(file.name) ? "logo" : "reference";
      const form = new FormData(); form.set("file", file); form.set("category", category); form.set("usageRole", category === "reference" ? "supporting" : "primary");
      const response = await fetch(`/api/companies/${id}/assets`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Could not upload ${file.name}.`);
      if (category === "logo") updated.logoAssetId = result.assetId;
      if (category === "font") updated.fontAssetIds.push(result.assetId);
    }
    setSelectedFiles([]);
    const response = await fetch(`/api/companies/${id}/onboarding`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), brand: updated, step: 4 }) });
    if (!response.ok) throw new Error("Your files were uploaded, but their brand settings could not be saved.");
    setBrand(updated);
  }

  async function finish() {
    if (!companyId) return;
    setBusy(true); setMessage("");
    try { await save(5); router.push(`/companies/${companyId}/settings`); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not finish setup."); setBusy(false); }
  }

  function updateSocial(label: string, url: string) {
    setBrand((current) => {
      const links = [...current.socialLinks]; const index = links.findIndex((link) => link.label.toLowerCase() === label.toLowerCase());
      if (index >= 0) links[index] = { label, url }; else links.push({ label, url });
      return { ...current, socialLinks: links };
    });
  }

  async function loadDesigns(search = "", more = false) {
    if (!companyId) return;
    setLoadingDesigns(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("query", search);
      if (more && continuation) params.set("continuation", continuation);
      const response = await fetch(`/api/companies/${companyId}/canva/designs?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load Canva designs.");
      setDesigns((current) => more ? [...current, ...(result.items ?? [])] : result.items ?? []);
      setContinuation(result.continuation ?? "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load Canva designs."); }
    finally { setLoadingDesigns(false); }
  }

  async function importDesign(design: Design) {
    if (!companyId) return;
    setImporting(design.id); setMessage("");
    try {
      const response = await fetch(`/api/companies/${companyId}/canva/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ designId: design.id, title: design.title ?? "Canva design", pageCount: design.page_count ?? 1 }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not import design.");
      setImported((current) => [...current, design.id]);
      setMessage(`Added “${design.title || "Canva design"}” to your company references.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import design."); }
    finally { setImporting(null); }
  }

  return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
    <PageHeader eyebrow={`Company setup · step ${step} of 4`} title={step === 1 ? "Tell us about your company." : step === 2 ? "Where can people find you?" : step === 3 ? "Make it sound and look like you." : "Bring your Canva work in."} description={step === 1 ? "We’ll use these details as context whenever your team creates something new." : step === 2 ? "Add your official channels and destinations. You can change these later." : step === 3 ? "Share the creative cues your team follows. Add any brand files you already have." : "Connect Canva to browse your designs, then save the ones you want as visual references."} />
    <ol className={styles.steps}>{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>

    {step < 4 ? <form className={styles.card} onSubmit={(event) => void next(event)}>
      {step === 1 && <div className={styles.fields}>
        <label>Company name *<Input required maxLength={120} value={name} placeholder="Your company" onChange={(event) => setName(event.target.value)} /></label>
        <label>Website<Input type="url" value={brand.website} placeholder="https://yourcompany.com" onChange={(event) => setBrand({ ...brand, website: event.target.value })} /></label>
        <label className={styles.wide}>What does your company do?<Textarea rows={5} maxLength={3000} placeholder="Describe your products, services, mission, and what makes them useful." value={brand.description} onChange={(event) => setBrand({ ...brand, description: event.target.value })} /></label>
      </div>}
      {step === 2 && <div className={styles.fields}>
        {socialNames.map((label) => <label key={label}>{label}<Input type="url" placeholder={`https://${label === "Twitter" ? "x.com" : label.toLowerCase() + ".com"}/yourcompany`} value={brand.socialLinks.find((link) => link.label.toLowerCase() === label.toLowerCase())?.url ?? ""} onChange={(event) => updateSocial(label, event.target.value)} /></label>)}
        <div className={styles.wide}><strong className={styles.groupLabel}>Other links</strong>{brand.socialLinks.map((link, index) => ({ ...link, index })).filter((link) => !socialNames.some((name) => name.toLowerCase() === link.label.toLowerCase())).map((link) => <div className={styles.linkRow} key={link.index}><Input aria-label="Link name" placeholder="Link name" value={link.label} onChange={(event) => setBrand((current) => ({ ...current, socialLinks: current.socialLinks.map((item, index) => index === link.index ? { ...item, label: event.target.value } : item) }))} /><Input aria-label="Link URL" type="url" placeholder="https://" value={link.url} onChange={(event) => setBrand((current) => ({ ...current, socialLinks: current.socialLinks.map((item, index) => index === link.index ? { ...item, url: event.target.value } : item) }))} /><Button variant="outline" type="button" onClick={() => setBrand((current) => ({ ...current, socialLinks: current.socialLinks.filter((_, index) => index !== link.index) }))}>Remove</Button></div>)}<Button variant="outline" className={styles.add} type="button" onClick={() => setBrand((current) => ({ ...current, socialLinks: [...current.socialLinks, { label: "", url: "" }] }))}>+ Add another link</Button></div>
      </div>}
      {step === 3 && <div className={styles.fields}>
        <label>Audience<Textarea rows={4} maxLength={2000} placeholder="Who are you speaking to?" value={brand.audience} onChange={(event) => setBrand({ ...brand, audience: event.target.value })} /></label>
        <label>Voice<Textarea rows={4} maxLength={2000} placeholder="How should your content sound?" value={brand.voice} onChange={(event) => setBrand({ ...brand, voice: event.target.value })} /></label>
        <label>Examples <small>One per line</small><Textarea rows={4} placeholder="Campaigns, phrases, or content you like" value={brand.examples.join("\n")} onChange={(event) => setBrand({ ...brand, examples: event.target.value.split("\n") })} /></label>
        <label>Format rules<Textarea rows={4} maxLength={2000} placeholder="Rules to follow in every post or design" value={brand.formatRules} onChange={(event) => setBrand({ ...brand, formatRules: event.target.value })} /></label>
        <div className={styles.wide}><strong className={styles.groupLabel}>Brand colors</strong><div className={styles.colorRows}>{brand.colors.map((color, index) => <div className={styles.colorRow} key={index}><input type="color" aria-label={`Choose brand color ${index + 1}`} value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000"} onChange={(event) => setBrand((current) => ({ ...current, colors: current.colors.map((item, i) => i === index ? event.target.value.toUpperCase() : item) }))} /><Input aria-label={`Brand color ${index + 1} hex code`} maxLength={7} value={color} placeholder="#6A4C93" onChange={(event) => setBrand((current) => ({ ...current, colors: current.colors.map((item, i) => i === index ? event.target.value : item) }))} /><Button variant="outline" type="button" onClick={() => setBrand((current) => ({ ...current, colors: current.colors.filter((_, i) => i !== index) }))}>Remove</Button></div>)}</div><Button variant="outline" className={styles.add} type="button" onClick={() => setBrand((current) => ({ ...current, colors: [...current.colors, "#6A4C93"] }))}>+ Add color</Button></div>
        <label className={styles.wide}>Brand files <small>Optional: logo, fonts, and visual references</small><input className={styles.fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.svg,.woff,.woff2,.ttf,.otf,.pdf" onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} /></label>
      </div>}
      <div className={styles.actions}>{step > 1 && <Button variant="outline" className={styles.back} type="button" disabled={busy} onClick={() => { setStep(step - 1); setMessage(""); }}>Back</Button>}<Button variant="default" className={styles.primary} type="submit" disabled={busy}>{busy ? "Saving…" : step === 3 ? "Continue to Canva" : "Continue"}<ArrowRightIcon size={17} /></Button></div>
    </form> : <section className={styles.card}>
      <div className={styles.canvaHead}><div className={styles.canvaMark}>C</div><div><h2>Connect your Canva account</h2><p>We’ll only show designs you can access. Pick the ones that should guide future content for this company. Multi-page designs are saved as a visual overview of up to 12 pages.</p></div></div>
      {canvaConnected ? <><div className={styles.connected}>✓ Canva connected</div><form className={styles.search} onSubmit={(event) => { event.preventDefault(); void loadDesigns(query); }}><Input aria-label="Search Canva designs" value={query} placeholder="Search your Canva designs" onChange={(event) => setQuery(event.target.value)} /><Button variant="default" type="submit" disabled={loadingDesigns}>Search</Button></form><div className={styles.designGrid}>{designs.map((design) => <article className={styles.designCard} key={design.id}>{design.thumbnail?.url ? <img src={design.thumbnail.url} alt="" /> : <div className={styles.designPlaceholder}>Canva design</div>}<div><strong>{design.title || "Untitled design"}</strong><small>{design.page_count ? `${design.page_count} ${design.page_count === 1 ? "page" : "pages"}` : "Canva"}</small><Button variant="outline" type="button" disabled={Boolean(importing) || imported.includes(design.id)} onClick={() => void importDesign(design)}>{imported.includes(design.id) ? "Added to references" : importing === design.id ? "Importing…" : "Use as reference"}</Button></div></article>)}</div>{loadingDesigns && <p className={styles.hint}>Loading designs…</p>}{!loadingDesigns && !designs.length && <p className={styles.hint}>No designs found. Try another search or finish setup and add references later.</p>}{continuation && <Button variant="outline" className={styles.more} type="button" disabled={loadingDesigns} onClick={() => void loadDesigns(query, true)}>Load more</Button>}</> : canvaConfigured ? <a className={styles.primary} href={`/api/companies/${companyId}/canva/connect`}>Connect Canva <ArrowRightIcon size={17} /></a> : <p className={styles.hint}>Canva connection will be available once this workspace’s Canva app credentials are configured. You can finish setup now and connect later.</p>}
      <div className={styles.finalActions}><Button variant="outline" className={styles.back} type="button" onClick={() => { setStep(3); setMessage(""); }}>Back</Button><Button variant="default" className={styles.primary} type="button" disabled={busy} onClick={() => void finish()}>{busy ? "Finishing…" : canvaConnected ? "Finish setup" : "Skip for now"}<ArrowRightIcon size={17} /></Button></div>
    </section>}
    {message && <p className={styles.message} role="status">{message}</p>}
    <p className={styles.footer}>Everything you add here stays with this company’s brand profile. <Link href={companyId ? `/companies/${companyId}/settings` : "/workspace"}>Leave setup</Link></p>
  </main>;
}
