'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {Button} from '@ola/components/ui/button';
import {Input} from '@ola/components/ui/input';
import {Textarea} from '@ola/components/ui/textarea';
import {NativeSelect} from '@ola/components/ui/native-select';
import {Badge} from '@ola/components/ui/badge';
import type {ComponentCandidate,ComponentJob} from '@ola/lib/semantic-design-store';
import styles from './page.module.css';
import {componentIntegration} from '@ola/lib/semantic-component-integrations';
import {SEMANTIC_COMPONENT_CHOICES} from '@ola/lib/semantic-component-presets';

const formats=['poster','story','carousel','post','presentation','article'];
export default function ComponentCandidates(){
 const [data,setData]=useState<{candidates:ComponentCandidate[];jobs:ComponentJob[]}>({candidates:[],jobs:[]});
 const [format,setFormat]=useState('story'),[attempt,setAttempt]=useState(''),[page,setPage]=useState(1);
 const [note,setNote]=useState(''),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
 async function refresh(){
  const r=await fetch('/api/components',{cache:'no-store'}),d=await r.json();
  if(!r.ok)throw Error(d.error);setData(d);
 }
 useEffect(()=>{
  const q=new URLSearchParams(window.location.search);
  if(q.get('attempt'))setAttempt(q.get('attempt')!);if(q.get('page'))setPage(Number(q.get('page')));
  void refresh().catch(e=>setError(e.message));
  const t=setInterval(()=>void refresh().catch(e=>setError(e.message)),2500);return()=>clearInterval(t);
 },[]);
 async function send(url:string,body:unknown){
  setError('');setSubmitting(true);
  try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setSubmitting(false);}
 }
 return <main className={`workspace-page ${styles.page}`}>
  <div className="page-heading"><div><div className="page-kicker">THE OLA LIBRARY · CANDIDATES</div><h1>Semantic component candidates</h1><p>Design, inspect and save useful new building blocks.</p></div><Link href="/api/semantic-designer-report" className="outline-link">Flagged example reruns <ArrowUpRight size={15}/></Link></div>
  <p className={styles.intro}>Review native designs across every format, then shortlist candidates for later library integration. Shortlisting does not publish or automatically enable a component.</p>
  <section className={styles.panel} aria-label="Design a component alternative">
   <form className={styles.form} onSubmit={e=>{e.preventDefault();void send('/api/components',{attemptId:attempt,page});}}>
    <label>Source Ola attempt ID<Input required value={attempt} onChange={e=>setAttempt(e.target.value)} placeholder="Saved attempt UUID"/></label>
    <label>Page<Input type="number" min={1} max={20} value={page} onChange={e=>setPage(Number(e.target.value))}/></label>
    <Button disabled={submitting}>{submitting?'Saving…':'Design an alternative'}</Button>
   </form>
   <p className={styles.help}>Choose a saved page with structured visual copy. The model and provider stay the same as its source attempt. Original outputs remain saved; candidates bind native geometry to canonical copy.</p>
  </section>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <details className={styles.jobs}><summary>Background design jobs ({data.jobs.length})</summary>{data.jobs.map(j=><p key={j.id}>{j.status} · page {j.source.page} · {j.model.model}{j.error?` · ${j.error}`:''}</p>)}</details>
  <div className={styles.controls}>
   <label>Preview format<NativeSelect aria-label="Component preview format" value={format} onChange={e=>setFormat(e.target.value)}>{formats.map(f=><option key={f}>{f}</option>)}</NativeSelect></label>
   <label>Review note<Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="What makes this reusable, or what needs improvement?"/></label>
  </div>
  <div className={styles.grid}>{data.candidates.map(c=>{const integration=componentIntegration(c.id);return <article key={c.id} className={styles.card}>
   <h2>{c.name}</h2><div className={styles.badges}><Badge variant="secondary">{c.status}</Badge><Badge variant="outline">{c.spec.relationship}</Badge>{integration&&<Badge variant="outline">{integration.decision==='implemented'?`Implemented · ${SEMANTIC_COMPONENT_CHOICES.find(choice=>choice.kind===integration.kind)?.name}`:'Not added to library'}</Badge>}</div>
   <p className={styles.reason}>{c.reason}</p>
   {integration&&<p className={styles.note}>{integration.note}</p>}
   {c.checks.find(v=>v.format===format)?.passed?<a className={styles.preview} href={`/api/components/${c.id}/preview?format=${format}`} target="_blank" rel="noopener">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/components/${c.id}/preview?format=${format}`} alt={`${c.name} in ${format}`}/></a>:<p>No passing preview for this format.</p>}
   <p className={styles.checks}>{c.checks.filter(v=>v.passed).length}/6 format checks passed · Visual review: {c.visualReview?.passed?'passed':c.visualReview?'needs improvement':'pending'}</p>
   <p className={styles.source}>Source page {c.page??'—'} · {c.attemptId??c.projectId??'Fixture'}</p>
   {c.error&&<p className={styles.error}>{c.error}</p>}
   <div className={styles.actions}>
    <Button size="sm" disabled={submitting||c.checks.length!==6||c.checks.some(v=>!v.passed)||!c.visualReview?.passed} onClick={()=>void send(`/api/components/${c.id}/review`,{status:'shortlisted',note})}>Shortlist for library</Button>
    <Button size="sm" variant="outline" disabled={submitting} onClick={()=>void send(`/api/components/${c.id}/review`,{status:'rejected',note})}>Reject</Button>
    <Button size="sm" variant="ghost" disabled={submitting} onClick={()=>void send(`/api/components/${c.id}/review`,{status:'candidate',note})}>Keep as candidate</Button>
   </div>
   <p className={styles.note}>{c.review?.note}</p>
   <details><summary>Specification, checks and provenance</summary><pre>{JSON.stringify({id:c.id,projectId:c.projectId,attemptId:c.attemptId,page:c.page,model:c.model,spec:c.spec,checks:c.checks,visualReview:c.visualReview,actions:c.actions},null,2)}</pre></details>
  </article>;})}</div>
 </main>;
}
