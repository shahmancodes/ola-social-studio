"use client";
import type { Brand } from '@/lib/platform';
import type { BrandLibrary } from '@/lib/brand-library';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

export function BrandLibraryFields({brand,onChange,disabled}:{brand:Brand;onChange:(brand:Brand)=>void;disabled:boolean}){
 const library=brand.library??{version:1 as const,revision:1,updatedAt:new Date().toISOString(),locales:['en'],visualLanguage:[],writingLanguage:[],preferredTerms:[],avoidTerms:[],sources:[]};
 function change(patch:Partial<BrandLibrary>){onChange({...brand,library:{...library,...patch,revision:library.revision+1,updatedAt:new Date().toISOString()}});}
 return <fieldset disabled={disabled} style={{border:'1px solid #ddd',padding:20,display:'grid',gap:16}}><legend>Brand memory and published examples</legend><p>Saved with each new project. Generation retrieves relevant examples for visual and writing style. Reference material is not automatically reused as artwork or factual evidence.</p>
 {([['visualLanguage','Visual language'],['writingLanguage','Writing language'],['preferredTerms','Preferred terms'],['avoidTerms','Terms to avoid']] as const).map(([key,label])=><label key={key}>{label} · one rule per line<Textarea rows={3} value={library[key].join('\n')} onChange={e=>change({[key]:e.target.value.split('\n').filter(Boolean)})}/></label>)}
 <label>Languages / locales<Input value={library.locales.join(', ')} onChange={e=>change({locales:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></label>
 {library.sources.map((source,index)=><details key={source.id}><summary>{source.title||'New source'} · {source.channel} · {source.status}</summary><div style={{display:'grid',gap:10,padding:12}}>
 {(['title','url','summary','visualNotes','writingNotes','excerpt'] as const).map(key=><label key={key}>{key}<Textarea rows={2} value={source[key]} onChange={e=>change({sources:library.sources.map((s,i)=>i===index?{...s,[key]:e.target.value}:s)})}/></label>)}
 <label>Source type<select value={source.channel} onChange={e=>change({sources:library.sources.map((s,i)=>i===index?{...s,channel:e.target.value as typeof s.channel}:s)})}>{['website','social','guideline','published'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label><input type="checkbox" checked={source.status==='captured'} onChange={e=>change({sources:library.sources.map((s,i)=>i===index?{...s,status:e.target.checked?'captured':'unavailable'}:s)})}/> Example reviewed and captured</label><p>Reference only · {source.capturedAt}{source.error?` · ${source.error}`:''}</p>
 <Button type="button" variant="outline" onClick={()=>change({sources:library.sources.filter((_,i)=>i!==index)})}>Remove source</Button></div></details>)}
 <Button type="button" variant="outline" disabled={library.sources.length>=60} onClick={()=>change({sources:[...library.sources,{id:crypto.randomUUID(),url:'https://',title:'',channel:'published',capturedAt:new Date().toISOString(),status:'unavailable',excerpt:'',summary:'',visualNotes:'',writingNotes:'',usage:'reference-only'}]})}>Add website or published post</Button><p>Save these details, then update the brand guide to fetch the website and saved source URLs. Inaccessible social pages are shown as unavailable; you can paste a reviewed excerpt instead.</p></fieldset>;
}
