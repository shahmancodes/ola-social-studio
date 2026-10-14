"use client";

import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Brand } from "@/lib/platform";
import { CompanyAssetList } from "./company-asset-list";
import { BrandGuide, exportBrandGuide } from "./brand-guide";
import { FilePicker } from "./file-picker";
import { ArrowRightIcon, ExportIcon } from "./ui-icons";
import { PageHeader } from "@/components/page-header";
import { NavTabs } from "@/components/ui/nav-tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import styles from "./company-settings.module.css";

const categories = [
  ["logo", "Logo / brand mark"], ["wordmark", "Wordmark"], ["font", "Font"], ["illustration", "Illustration"],
  ["photography", "Photography"], ["icon", "Icon"], ["template", "Template"], ["reference", "Reference"],
] as const;
const standardLinks = ["Instagram", "Twitter", "LinkedIn"] as const;
type Job = { id: string; status: string; error?: string | null } | null;
type Tab = "guide" | "assets" | "details";

function isWebUrl(value: string) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

export function CompanySettings({ companyId, companyName, initial, canAdmin, tab }: { companyId: string; companyName: string; initial: Brand; canAdmin: boolean; tab: Tab }) {
  const [brand, setBrand] = useState(initial);
  const [category, setCategory] = useState<(typeof categories)[number][0]>("logo");
  const [usageRole, setUsageRole] = useState<"primary" | "supporting">("primary");
  const [files, setFiles] = useState<File[]>([]);
  const [assetRefresh, setAssetRefresh] = useState(0);
  const [job, setJob] = useState<Job>(null);
  const appliedJob = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [invite, setInvite] = useState("");
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(`/api/companies/${companyId}/theme`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setJob(data.job);
        if (data.job?.status === "complete" && data.brand.themeCard?.generatedAt !== initial.themeCard?.generatedAt && appliedJob.current !== data.job.id) {
          appliedJob.current = data.job.id;
          if (tab === "guide") setBrand(data.brand);
        }
      } catch { /* Polling resumes on the next interval. */ }
    }
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [companyId, initial.themeCard?.generatedAt, tab]);

  async function save(next: Brand) {
    const response = await fetch(`/api/companies/${companyId}/brand`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not save brand.");
    setBrand(result.brand);
    return result.brand as Brand;
  }

  async function upload(selectedFiles = files) {
    if (!selectedFiles.length) return;
    setBusy(true); setMessage("");
    let next = { ...brand, fontAssetIds: [...brand.fontAssetIds], artworkAssetIds: [...brand.artworkAssetIds] };
    let uploaded = 0;
    try {
      for (const file of selectedFiles) {
        const form = new FormData(); form.set("category", category); form.set("usageRole", usageRole); form.set("file", file);
        const response = await fetch(`/api/companies/${companyId}/assets`, { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? `Could not upload ${file.name}.`);
        if (category === "logo") next.logoAssetId = result.assetId;
        else if (category === "wordmark") next.wordmarkAssetId = result.assetId;
        else if (category === "font") next.fontAssetIds.push(result.assetId);
        else if (["illustration", "photography", "icon"].includes(category)) next.artworkAssetIds.push(result.assetId);
        uploaded++;
      }
      next = await save(next);
      setFiles([]); setAssetRefresh((value) => value + 1);
      setMessage(`${selectedFiles.length} ${selectedFiles.length === 1 ? "asset" : "assets"} added to your library.`);
    } catch (error) {
      if (uploaded) {
        try { await save(next); } catch { /* Uploaded files remain in the library. */ }
        setAssetRefresh((value) => value + 1);
      }
      setMessage(`${uploaded ? `${uploaded} added. ` : ""}${error instanceof Error ? error.message : "Upload failed."}`);
    } finally { setBusy(false); }
  }

  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/companies/${companyId}/theme`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: brand.website.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not start brand guide generation.");
      setJob(result.job);
      setMessage("Your brand guide is being created. You can keep working.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start brand guide generation."); }
    finally { setBusy(false); }
  }

  function updateLink(index: number, field: "label" | "url", value: string) {
    setBrand((current) => ({ ...current, socialLinks: current.socialLinks.map((link, i) => i === index ? { ...link, [field]: value } : link) }));
  }

  function updateStandardLink(label: string, url: string) {
    setBrand((current) => {
      const index = current.socialLinks.findIndex((link) => link.label.toLowerCase() === label.toLowerCase());
      const socialLinks = [...current.socialLinks];
      if (index >= 0) socialLinks[index] = { label, url };
      else socialLinks.push({ label, url });
      return { ...current, socialLinks };
    });
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const colors = brand.colors.map((color) => color.trim().toUpperCase());
    if (colors.some((color) => !/^#[0-9A-F]{6}$/.test(color))) { setMessage("Use six-digit hex values such as #6A4C93 for every color."); return; }
    const socialLinks = brand.socialLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label || link.url);
    if (socialLinks.some((link) => !link.label || !link.url || !isWebUrl(link.url))) { setMessage("Each added link needs a name and an HTTP or HTTPS URL."); return; }
    if (brand.website.trim() && !isWebUrl(brand.website.trim())) { setMessage("Enter an HTTP or HTTPS website URL."); return; }
    setBusy(true);
    try {
      await save({ ...brand, description: brand.description.trim(), website: brand.website.trim(), colors, socialLinks });
      setMessage("Brand details saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }

  const uploadControls = <div className={styles.uploadControls}>
    <label className={styles.field}>Asset type<NativeSelect value={category} disabled={!canAdmin || busy} onChange={(event) => setCategory(event.target.value as typeof category)}>{categories.map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></label>
    <label className={styles.field}>Used as<NativeSelect value={usageRole} disabled={!canAdmin || busy} onChange={(event) => setUsageRole(event.target.value as typeof usageRole)}><NativeSelectOption value="primary">Primary visual</NativeSelectOption><NativeSelectOption value="supporting">Supporting detail</NativeSelectOption></NativeSelect></label>
    <div className={styles.fileField}><span>Files</span><FilePicker key={assetRefresh} multiple accept=".png,.jpg,.jpeg,.webp,.svg,.woff,.woff2,.ttf,.otf,.pdf" title="Choose brand files" hint="PNG, SVG, JPG, WEBP, fonts or PDF · up to 20 MB each" onChange={(event: ChangeEvent<HTMLInputElement>) => setFiles(Array.from(event.target.files ?? []))} /></div>
    <Button variant="default" className={styles.darkButton} type="button" disabled={!canAdmin || !files.length || busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Add assets"}<ArrowRightIcon size={17} /></Button>
  </div>;

  const customLinks = brand.socialLinks.map((link, index) => ({ ...link, index })).filter((link) => !standardLinks.some((name) => name.toLowerCase() === link.label.toLowerCase()));

  return <main className={styles.page}>
    <PageHeader title="Brand" description="Your guide, assets, and company information in one place." />
    <NavTabs label="Brand sections" items={[
      { label: "Brand guide", href: `/companies/${companyId}/settings`, active: tab === "guide" },
      { label: "Assets", href: `/companies/${companyId}/settings?tab=assets`, active: tab === "assets" },
      { label: "Brand details", href: `/companies/${companyId}/settings?tab=details`, active: tab === "details" },
    ]} />

    {tab === "guide" && <section id="brand-guide" className={styles.brandGuideSection}>
      <div className={styles.guideHeading}>
        <div><h2>Brand guide</h2><p>A reference for the work your team creates.</p></div>
        {brand.themeCard && <div className={styles.guideActions}>
          <DropdownMenu><DropdownMenuTrigger asChild><IconButton variant="outline" size="icon" type="button" label="Export brand guide" title="Export brand guide"><ExportIcon /></IconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><a href={`/api/companies/${companyId}/theme/pdf`}>Export as PDF</a></DropdownMenuItem><DropdownMenuItem onSelect={() => void exportBrandGuide(companyId, companyName, brand)}>Export as SVG</DropdownMenuItem></DropdownMenuContent></DropdownMenu>

        </div>}
      </div>
      {brand.themeCard ? <BrandGuide companyId={companyId} companyName={companyName} brand={brand} /> : <div className={styles.emptyGuide}><h3>Your guide starts here</h3><p>Add your website and brand assets, then generate a guide from what you have.</p><div className={styles.guideLinks}><a href={`/companies/${companyId}/settings?tab=details`}>Add brand details</a><a href={`/companies/${companyId}/settings?tab=assets`}>Add assets</a></div></div>}
      {canAdmin && <div className={styles.generateBar}><div><strong>{brand.themeCard ? "Update your guide" : "Create your guide"}</strong><p>{brand.website ? `Using ${brand.website}` : "Uses your saved details and uploaded assets."}</p></div><Button variant="default" className={styles.darkButton} type="button" disabled={busy || job?.status === "queued" || job?.status === "running"} onClick={() => void generate()}>{brand.themeCard ? "Regenerate guide" : "Generate guide"}<ArrowRightIcon size={17} /></Button></div>}
      {job && <p className={styles.jobStatus} role="status">{job.status === "complete" ? "Brand guide ready." : job.status === "failed" ? `Generation needs attention: ${job.error}` : "Creating your brand guide…"}</p>}
      {message && <p className={styles.response} role="status">{message}</p>}
    </section>}

    {tab === "assets" && <section className={styles.assetsSection}>
      <div className={styles.sectionTitle}><h2>Assets</h2><p>Logos, fonts, imagery, and reference files for your team.</p>{canAdmin && <a className={styles.canvaLink} href={`/companies/${companyId}/onboarding?step=4`}>Browse Canva references <ArrowRightIcon size={16} /></a>}</div>
      {canAdmin && <details className={styles.assetUpload}><summary className={styles.assetUploadSummary}><span className={styles.assetUploadHeading}><strong>Upload brand files</strong><small>Logos, artwork, fonts, templates and more</small></span><span className={styles.assetUploadAction}>Add files <span aria-hidden="true">+</span></span></summary>{uploadControls}</details>}
      {message && <p className={styles.response} role="status">{message}</p>}
      <CompanyAssetList companyId={companyId} refreshKey={assetRefresh} canDelete={canAdmin} onDeleted={(assetId) => setBrand((current) => ({ ...current, logoAssetId: current.logoAssetId === assetId ? null : current.logoAssetId, wordmarkAssetId: current.wordmarkAssetId === assetId ? null : current.wordmarkAssetId, fontAssetIds: current.fontAssetIds.filter((id) => id !== assetId), artworkAssetIds: current.artworkAssetIds.filter((id) => id !== assetId), themeCard: current.themeCard ? { ...current.themeCard, featuredAssetId: current.themeCard.featuredAssetId === assetId ? null : current.themeCard.featuredAssetId } : null }))} />
    </section>}

    {tab === "details" && <>
      <form className={styles.detailsForm} onSubmit={(event) => void saveDetails(event)}>
        <div className={styles.sectionTitle}><h2>Brand details</h2><p>Keep your company information and visual identity current.</p></div>
        <section className={styles.detailsSection} aria-labelledby="company-info-title"><div className={styles.detailsSectionHeading}><h3 id="company-info-title">Company</h3><p>Give your team a clear description of what you do.</p></div><div className={styles.detailsFields}>
          <label className={`${styles.field} ${styles.fullWidth}`}>What the company does<Textarea rows={4} placeholder="Describe your products, services, and purpose" value={brand.description} disabled={!canAdmin} onChange={(event) => setBrand({ ...brand, description: event.target.value })} /></label>
          <label className={`${styles.field} ${styles.fullWidth}`}>Website<Input type="url" placeholder="https://example.com" value={brand.website} disabled={!canAdmin} onChange={(event) => setBrand({ ...brand, website: event.target.value })} /></label>
        </div></section>
        <section className={styles.detailsSection} aria-labelledby="colors-title"><div className={styles.detailsSectionHeading}><h3 id="colors-title">Colors</h3><p>Choose each color or enter its six-digit hex code.</p></div><div className={styles.colorList}>
          {brand.colors.map((color, index) => <div className={styles.colorRow} key={index}><input className={styles.colorPicker} type="color" aria-label={`Choose color ${index + 1}`} value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#000000"} disabled={!canAdmin} onChange={(event) => setBrand((current) => ({ ...current, colors: current.colors.map((item, i) => i === index ? event.target.value.toUpperCase() : item) }))} /><label className={styles.field}>Color {index + 1}<Input className={styles.hexInput} type="text" inputMode="text" maxLength={7} placeholder="#6A4C93" value={color} disabled={!canAdmin} onChange={(event) => setBrand((current) => ({ ...current, colors: current.colors.map((item, i) => i === index ? event.target.value : item) }))} /></label>{canAdmin && <Button variant="outline" className={styles.removeButton} type="button" aria-label={`Remove color ${index + 1}`} onClick={() => setBrand((current) => ({ ...current, colors: current.colors.filter((_, i) => i !== index) }))}>Remove</Button>}</div>)}
          {canAdmin && <Button variant="outline" className={styles.addButton} type="button" onClick={() => setBrand((current) => ({ ...current, colors: [...current.colors, "#6A4C93"] }))}>+ Add color</Button>}
        </div></section>
        <section className={styles.detailsSection} aria-labelledby="links-title"><div className={styles.detailsSectionHeading}><h3 id="links-title">Links</h3><p>Your official social channels and other destinations.</p></div><div className={styles.detailsFields}>
          {standardLinks.map((label) => <label className={styles.field} key={label}>{label}<Input type="url" placeholder={`https://${label === "Twitter" ? "x.com" : label.toLowerCase() + ".com"}/yourcompany`} value={brand.socialLinks.find((link) => link.label.toLowerCase() === label.toLowerCase())?.url ?? ""} disabled={!canAdmin} onChange={(event) => updateStandardLink(label, event.target.value)} /></label>)}
          {customLinks.map((link) => <div className={styles.customLinkRow} key={link.index}><label className={styles.field}>Link name<Input type="text" placeholder="YouTube" value={link.label} disabled={!canAdmin} onChange={(event) => updateLink(link.index, "label", event.target.value)} /></label><label className={styles.field}>URL<Input type="url" placeholder="https://example.com" value={link.url} disabled={!canAdmin} onChange={(event) => updateLink(link.index, "url", event.target.value)} /></label>{canAdmin && <Button variant="outline" className={styles.removeButton} type="button" onClick={() => setBrand((current) => ({ ...current, socialLinks: current.socialLinks.filter((_, i) => i !== link.index) }))}>Remove</Button>}</div>)}
          {canAdmin && <Button variant="outline" className={styles.addButton} type="button" onClick={() => setBrand((current) => ({ ...current, socialLinks: [...current.socialLinks, { label: "", url: "" }] }))}>+ Add link</Button>}
        </div></section>
        <section className={styles.detailsSection} aria-labelledby="direction-title"><div className={styles.detailsSectionHeading}><h3 id="direction-title">Creative direction</h3><p>Notes used when creating new projects.</p></div><div className={styles.detailsFields}>
          <label className={styles.field}>Audience<Textarea rows={3} value={brand.audience} disabled={!canAdmin} onChange={(event) => setBrand({ ...brand, audience: event.target.value })} /></label>
          <label className={styles.field}>Voice<Textarea rows={3} value={brand.voice} disabled={!canAdmin} onChange={(event) => setBrand({ ...brand, voice: event.target.value })} /></label>
          <label className={styles.field}>Examples <small>One per line</small><Textarea rows={3} value={brand.examples.join("\n")} disabled={!canAdmin} onChange={(event) => setBrand({ ...brand, examples: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></label>
          <label className={styles.field}>Format rules<Textarea rows={3} value={brand.formatRules} disabled={!canAdmin} onChange={(event) => setBrand({ ...brand, formatRules: event.target.value })} /></label>
        </div></section>
        {canAdmin && <div className={styles.saveBar}><Button variant="default" className={styles.darkButton} type="submit" disabled={busy}>{busy ? "Saving…" : "Save brand details"}<ArrowRightIcon size={17} /></Button></div>}
        {message && <p className={styles.response} role="status">{message}</p>}
      </form>
      {canAdmin && <section className={styles.section}><div className={styles.sectionTitle}><h2>Invite a teammate</h2><p>Bring your team into this workspace.</p></div><form className={styles.inviteForm} onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch(`/api/companies/${companyId}/invite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), role: form.get("role") }) }); const result = await response.json(); setInvite(result.url ?? result.error); }}><Input name="email" type="email" placeholder="teammate@example.com" required /><NativeSelect name="role"><NativeSelectOption value="member">Member</NativeSelectOption><NativeSelectOption value="admin">Admin</NativeSelectOption></NativeSelect><Button variant="outline" className={styles.outlineButton}>Create invite link</Button></form>{invite && <p className={styles.response}>{invite}</p>}</section>}
    </>}
  </main>;
}
