'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowUpRight, Layers3, Shapes, LayoutTemplate, Type, Building2, RefreshCw, TextCursorInput } from 'lucide-react';
import { Button } from '@ola/components/ui/button';
import { Input } from '@ola/components/ui/input';
import { Badge } from '@ola/components/ui/badge';
import { NativeSelect } from '@ola/components/ui/native-select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@ola/components/ui/dialog';
import { resolveTextbox, textboxCss, compositeColor } from '@ola/lib/textbox-style';
import { readableInk } from '@ola/lib/brand-design';
import type { SentinelLibrary } from '@ola/comparison/sentinel-library';

type Category = 'textboxes' | 'components' | 'recipes' | 'templates' | 'brands' | 'fonts';
const categories = [{ id: 'textboxes', label: 'Textbox presets', icon: TextCursorInput }, { id: 'components', label: 'Semantic components', icon: Shapes }, { id: 'recipes', label: 'Design recipes', icon: Layers3 }, { id: 'templates', label: 'Source templates', icon: LayoutTemplate }, { id: 'brands', label: 'Brand assets', icon: Building2 }, { id: 'fonts', label: 'Fonts', icon: Type }] as const;

const previewPalette={background:'#ffffff',alternate:'#eef0f5',accent:'#2954d1',ink:'#172033',dark:'#172033'};

export default function Assets() {
  const [data, setData] = useState<SentinelLibrary>();
  const [category, setCategory] = useState<Category>('components');
  const [query, setQuery] = useState(''), [company, setCompany] = useState('all');
  const [format, setFormat] = useState('poster');
  const [selected, setSelected] = useState<SentinelLibrary['components'][number]>();
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true); setError('');
    try { const r = await fetch('/api/library', { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw Error(d.error); setData(d); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { const id=new URLSearchParams(window.location.search).get('category'); if(categories.some(c=>c.id===id))setCategory(id as Category); void refresh(); }, []);
  const matches = (...values: string[]) => values.join(' ').toLowerCase().includes(query.toLowerCase());
  const counts = data ? { textboxes: data.textboxes.length, components: data.components.length, recipes: data.recipes.length, templates: data.templates.length, brands: data.companies.reduce((n, c) => n + c.assets.length, 0), fonts: data.fonts.length } : undefined;
  const textboxes = data?.textboxes.filter(p => matches(p.name,p.id,p.description)) ?? [];
  const components = data?.components.filter(c => matches(c.name, c.kind, c.description)) ?? [];
  const recipes = data?.recipes.filter(r => matches(r.name, r.family, r.needs, r.id)) ?? [];
  const templates = data?.templates.filter(t => matches(t.name, t.category, t.why, t.sourceInfo.name)) ?? [];
  const brandAssets = data?.companies.filter(c => company === 'all' || c.id === company).flatMap(c => c.assets.map(a => ({ ...a, companyName: c.name, companyId: c.id }))).filter(a => matches(a.name, a.category, a.companyName, a.media_type)) ?? [];
  const fonts = data?.fonts.filter(f => matches(f.label, f.id)) ?? [];
  const visible = { textboxes: textboxes.length, components: components.length, recipes: recipes.length, templates: templates.length, brands: brandAssets.length, fonts: fonts.length }[category];
  return <main className="workspace-page">
    <div className="page-heading"><div><div className="page-kicker">THE OLA LIBRARY</div><h1>Assets</h1><p>The building blocks behind every generation.</p></div><Link href="/components" className="outline-link">Review component candidates <ArrowUpRight size={15}/></Link></div>
    <div className="library-overview">{categories.map(({ id, label, icon: Icon }) => <button key={id} className={`library-category ${category === id ? 'selected' : ''}`} onClick={() => setCategory(id)} aria-pressed={category === id}><Icon/><strong>{counts?.[id] ?? '—'}</strong><span>{label}</span></button>)}</div>
    <div className="section-heading"><div><h2>{categories.find(c => c.id === category)?.label}</h2><p>{category === 'textboxes' ? 'Ten editable treatments available to agents. Open one to customize its borders, corners, colors, opacity, padding and typography.' : category === 'components' ? 'Reusable visuals available to Ola. Open one to inspect its native rendering and example data.' : category === 'recipes' ? 'Approved compositions used by the generation pipeline, with requirements and source credits.' : category === 'templates' ? 'Curated source references for review. Only approved design recipes are enabled in generation.' : category === 'brands' ? 'Saved images and fonts available to Ola, grouped by company.' : 'Font choices available in the Ola editor. Brand fonts are listed under Brand assets.'}</p></div><Badge variant="secondary">{visible} shown</Badge></div>
    <div className="workspace-filters"><div className="filter-search"><Search/><Input aria-label="Search assets" placeholder="Search the library…" value={query} onChange={e => setQuery(e.target.value)}/></div>{category === 'brands' && <NativeSelect aria-label="Filter assets by company" value={company} onChange={e => setCompany(e.target.value)}><option value="all">All companies</option>{data?.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>}{category === 'recipes' && <NativeSelect aria-label="Recipe preview format" value={format} onChange={e => setFormat(e.target.value)}>{['poster', 'story', 'carousel'].map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)} preview</option>)}</NativeSelect>}<Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw/> Refresh</Button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading && !data ? <div className="workspace-empty" role="status">Loading Ola’s library…</div> : !data ? <div className="workspace-empty">The library could not be loaded. Use Refresh to try again.</div> : !visible ? <div className="workspace-empty">No assets match these filters.</div> : <>
      {category === 'textboxes' && <div className="asset-grid">{textboxes.map(p=>{const box=resolveTextbox({preset:p.id},previewPalette,.5),surface=box?.fill?compositeColor(box.fill,box.fillOpacity,previewPalette.background):previewPalette.background;return <Link className="asset-card textbox-asset-card" key={p.id} href={p.previewUrl} aria-label={`Explore ${p.name} textbox preset`}><div className="textbox-asset-preview" aria-hidden="true"><span style={{...textboxCss(box),color:readableInk(surface,previewPalette.ink)}}>One clear idea</span></div><div className="asset-card-body"><Badge variant="secondary">Editable preset</Badge><h3>{p.name}<ArrowUpRight size={15}/></h3><p>{p.description}</p><code>{p.id}</code></div></Link>;})}</div>}
      {category === 'components' && <div className="asset-grid">{components.map(c => <button className="asset-card semantic-card" key={c.kind} onClick={() => setSelected(c)}><div className="semantic-preview" aria-hidden="true"><div className="semantic-preview-inner" dangerouslySetInnerHTML={{ __html: c.previewHtml }}/></div><div className="asset-card-body"><Badge variant="secondary">Built in</Badge><h3>{c.name}<ArrowUpRight size={15}/></h3><p>{c.description}</p><code>{c.kind}</code></div></button>)}</div>}
      {category === 'recipes' && <div className="asset-grid recipe-grid">{recipes.map(r => <article className="asset-card" key={r.id}>{r.previews[format] ? <a className="asset-preview" href={r.previews[format]} target="_blank" rel="noreferrer"><img loading="lazy" src={r.previews[format]} alt={`${r.name} · ${format} sample`}/></a> : <div className="asset-preview missing-preview"><LayoutTemplate/><span>No saved {format} preview</span></div>}<div className="asset-card-body"><Badge variant="secondary">Enabled recipe</Badge><h3>{r.name}</h3><p>{r.needs}</p><div className="asset-meta"><code>{r.family}</code><span>{r.license}</span></div><details><summary>Source & attribution</summary><p>{r.author}</p><a href={r.source} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12}/></a><p>Adapted into native Ola layouts, with brand typography and responsive fitting.</p></details></div></article>)}</div>}
      {category === 'templates' && <div className="asset-grid recipe-grid">{templates.map(t => <article className="asset-card" key={t.id}>{t.preview ? <a href={t.preview} target="_blank" rel="noreferrer" className="asset-preview template-preview"><img loading="lazy" src={t.preview} alt={t.name}/></a> : <div className="asset-preview missing-preview"><LayoutTemplate/><span>Preview not generated</span></div>}<div className="asset-card-body"><Badge variant="outline">Source reference</Badge><h3>{t.name}</h3><p>{t.why}</p><details><summary>Capacity, formats & source</summary><p>{t.capacity}</p><p>{t.formats}</p><p>{t.adaptation}</p><p>{t.sourceInfo.author} · {t.sourceInfo.license}</p><a href={t.sourceInfo.licenseUrl} target="_blank" rel="noreferrer">Source license ↗</a></details></div></article>)}</div>}
      {category === 'brands' && <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Asset</th><th>Company</th><th>Category</th><th>Type</th></tr></thead><tbody>{brandAssets.map(a => <tr key={`${a.companyId}:${a.id}`}><td><strong>{a.name}</strong><small>{a.id}</small></td><td>{a.companyName}</td><td><Badge variant="secondary">{a.category}</Badge></td><td>{a.media_type}</td></tr>)}</tbody></table></div>}
      {category === 'fonts' && <div className="asset-grid">{fonts.map(f => <article className="asset-card font-card" key={f.id}><Type/><h3>{f.label}</h3><code>{f.id}</code><Badge variant="secondary">{f.bundled ? 'Bundled font' : 'System font'}</Badge></article>)}</div>}
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(undefined); }}><DialogContent className="component-dialog"><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.description} · Sample data for inspection.</DialogDescription>{selected && <><div className="component-large-preview" role="img" aria-label={`${selected.name} native preview`}><div className="semantic-preview-inner" dangerouslySetInnerHTML={{ __html: selected.previewHtml }}/></div><details><summary>Example component data</summary><pre>{JSON.stringify(selected.example, null, 2)}</pre></details></>}</DialogContent></Dialog>
  </main>;
}
