"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SimpleArtifact } from '@/lib/simple-content';
import type { OlaTarget } from '@/lib/ola-edit';
import { useOlaMode } from './ola-mode';
import type { CanvasPreview } from '@/lib/canvas-text';
import { artifactPages, withArtifactPages, type CopyPage } from '@/lib/composition';
import type { CanvasReviewFocus } from '@/lib/editor-review';
import { persistedObjects, reflowCanvasObjects, type CanvasObject, type PreviewObject } from '@/lib/freeform-canvas';
import { InstagramPreview } from './instagram-preview';
import { FreeformPageCanvas } from './freeform-page-canvas';
import styles from './visual-content-canvas.module.css';

type VisualArtifact=Extract<SimpleArtifact,{type:'post'|'story'|'poster'|'carousel'|'presentation'}>;
export function VisualContentCanvas({artifact,projectId,version,activeIndex,onChange,onSelectionChange,onActiveIndexChange,disabled=false,onEditingChange,onPreviewPendingChange,companyId,assets=[],fonts=[],reviewFocus,onUndo,onRedo}: {
  artifact:VisualArtifact;projectId:string;version:number;activeIndex:number;onChange:(next:SimpleArtifact,historyGroup?:string)=>void;
  onSelectionChange?:(target:OlaTarget)=>void;onActiveIndexChange?:(index:number)=>void;disabled?:boolean;onEditingChange?:(editing:boolean)=>void;
  onPreviewPendingChange?:(pending:boolean)=>void;reviewFocus?:CanvasReviewFocus|null;onUndo?:()=>void;onRedo?:()=>void;
  companyId:string;assets?:Array<{id:string;name:string}>;fonts?:Array<{id:string;name:string}>;advanced?:ReactNode;
}) {
  const olaMode=useOlaMode();
  const [preview,setPreview]=useState<CanvasPreview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reflowing,setReflowing]=useState(false);
  const artifactRef=useRef(artifact);artifactRef.current=artifact;
  const revision=useRef(0),mounted=useRef(true);
  const page=artifactPages(artifact)[activeIndex];
  const signature=JSON.stringify({page,index:activeIndex,projectId,total:'slides' in artifact?artifact.slides.length:1,storyTreatment:artifact.type==='story'?artifact.storyTreatment:undefined});
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{onPreviewPendingChange?.(loading||reflowing||!!error);},[loading,reflowing,error,onPreviewPendingChange]);
  useEffect(()=>()=>onPreviewPendingChange?.(false),[onPreviewPendingChange]);
  async function requestPreview(value:VisualArtifact,signal?:AbortSignal):Promise<CanvasPreview>{
    const response=await fetch(`/api/content/${projectId}/draft-preview`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({artifact:value,index:activeIndex,editor:true}),signal});
    if(!response.ok)throw new Error((await response.json()).error??'Preview unavailable.');
    return response.json();
  }
  useEffect(()=>{
    const current=++revision.current,controller=new AbortController();setLoading(true);
    const timer=setTimeout(async()=>{try{const next=await requestPreview(artifactRef.current,controller.signal);if(current!==revision.current||controller.signal.aborted)return;setPreview(next);setError('');}catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Preview unavailable.');}finally{if(current===revision.current&&!controller.signal.aborted)setLoading(false);}},380);
    return()=>{controller.abort();clearTimeout(timer);};
  // Requests only depend on visible page content, not save versions or captions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);
  function withPage(next:CopyPage){const current=artifactRef.current;return withArtifactPages(current,artifactPages(current).map((p,i)=>i===activeIndex?next:p)) as VisualArtifact;}
  function updatePage(next:CopyPage,group?:string){const value=withPage(next);artifactRef.current=value;onChange(value,group);}
  function updateObjects(objects:CanvasObject[],group?:string){const current=artifactPages(artifactRef.current)[activeIndex];updatePage({...current,editorAppearance:{...current.editorAppearance,freeform:{version:1,objects}}},group);}
  async function changeLayout(next:CopyPage){
    if(reflowing||!preview)return;
    setReflowing(true);setError('');
    const before=artifactRef.current;
    const previous:PreviewObject[]=page.editorAppearance?.freeform?.objects??preview.objects??[];
    const candidate={...next,editorAppearance:{...next.editorAppearance,freeform:undefined}};
    try{
      const value=withPage(candidate),generated=await requestPreview(value);
      if(!mounted.current)return;
      // Do not overwrite a simultaneous change from undo, AI or another control.
      if(artifactRef.current!==before)throw new Error('The design changed while applying this layout. Try the layout again.');
      const objects=reflowCanvasObjects(generated.objects??[],previous);
      setPreview(generated);updatePage({...candidate,editorAppearance:{...candidate.editorAppearance,freeform:{version:1,objects:persistedObjects(objects)}}});
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Could not apply this layout.');}
    finally{if(mounted.current)setReflowing(false);}
  }
  const single=artifact.type==='post'||artifact.type==='story'||artifact.type==='poster';
  return <div className={styles.wrap}>
    {(artifact.type==='post'||artifact.type==='carousel')&&<InstagramPreview artifact={artifact} projectId={projectId} brandName={preview?.brandName} disabled={disabled}/>}
    {preview?<FreeformPageCanvas projectId={projectId} story={artifact.type==='story'} preview={preview} page={page} companyId={companyId} assets={assets} fonts={fonts} disabled={disabled||reflowing} commentMode={olaMode} busy={loading||reflowing} onObjects={updateObjects} onPageChange={updatePage} onLayout={changeLayout} onEditingChange={onEditingChange} onUndo={onUndo} onRedo={onRedo} focusIds={reviewFocus?[...reviewFocus.targets,...(reviewFocus.source?[reviewFocus.source]:[])]:[]}
      onSelect={(object,index)=>{if(!page.editorAppearance?.freeform)updateObjects(persistedObjects(preview.objects??[]));onSelectionChange?.({label:object.kind==='text'?object.text?.slice(0,60)??'Text':object.kind,path:single?['editorAppearance','freeform','objects',index]:['slides',activeIndex,'editorAppearance','freeform','objects',index],id:object.id});}}/>:<p className={styles.help}>Opening your canvas…</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {artifact.type==='carousel'&&<div className={styles.thumbnailStrip} aria-label="Carousel slide order">{artifact.slides.map((slide,index)=><button type="button" key={slide.id??index} onClick={()=>onActiveIndexChange?.(index)} aria-current={index===activeIndex?'true':undefined} aria-label={`Open slide ${index+1}: ${slide.title}`} className={`${styles.thumbnail} ${index===activeIndex?styles.thumbnailActive:''}`}><span>{index+1}</span>{artifact.imagePaths[index]?<img src={`/api/content/${projectId}/preview?slide=${index+1}&v=${version}`} alt=""/>:<strong>{slide.title}</strong>}</button>)}</div>}
    {(artifact.type==='carousel'||artifact.type==='post')&&<label className={styles.captionEditor}><strong>Caption</strong><textarea value={artifact.caption} disabled={disabled||olaMode} onChange={e=>onChange({...artifactRef.current,caption:e.target.value} as SimpleArtifact)} rows={3} aria-label="Caption"/></label>}
  </div>;
}
