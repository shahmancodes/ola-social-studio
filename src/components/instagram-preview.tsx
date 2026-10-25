"use client";

import { useEffect, useRef, useState } from 'react';
import { Eye, Monitor, Smartphone, Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight, Home, Search, Compass, PlusSquare, Menu, LoaderCircle } from 'lucide-react';
import type { SimpleArtifact } from '@/lib/simple-content';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import styles from './instagram-preview.module.css';

type SocialArtifact=Extract<SimpleArtifact,{type:'post'|'carousel'}>;
export function InstagramPreview({artifact,projectId,brandName='Your brand',disabled=false}:{artifact:SocialArtifact;projectId:string;brandName?:string;disabled?:boolean}) {
  const [snapshot,setSnapshot]=useState<SocialArtifact|null>(null);
  return <><button className={styles.trigger} disabled={disabled} onClick={()=>setSnapshot(artifact)}><Eye size={16}/> Show preview</button>{snapshot&&<Preview artifact={snapshot} projectId={projectId} brandName={brandName} onClose={()=>setSnapshot(null)}/>}</>;
}
function Preview({artifact,projectId,brandName,onClose}:{artifact:SocialArtifact;projectId:string;brandName:string;onClose:()=>void}) {
  const [device,setDevice]=useState<'mobile'|'web'>('mobile'),[index,setIndex]=useState(0),[images,setImages]=useState<Record<number,string>>({}),[error,setError]=useState(''),[retry,setRetry]=useState(0),[expanded,setExpanded]=useState(false);
  const urls=useRef(new Map<number,string>()),touch=useRef<number|null>(null);
  const total=artifact.type==='carousel'?artifact.slides.length:1;
  useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  useEffect(()=>{
    setError('');if(urls.current.has(index))return;
    const controller=new AbortController();
    async function render(){try{const response=await fetch(`/api/content/${projectId}/draft-preview`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({artifact,index}),signal:controller.signal});if(!response.ok)throw new Error((await response.json()).error??'Could not render this slide.');const blob=await response.blob();if(controller.signal.aborted)return;const url=URL.createObjectURL(blob);urls.current.set(index,url);setImages(current=>({...current,[index]:url}));}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load preview.');}}
    void render();return()=>controller.abort();
  },[artifact,index,projectId,retry]);
  const move=(direction:number)=>setIndex(value=>Math.min(total-1,Math.max(0,value+direction)));
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={styles.dialog} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}}}><div className={styles.heading}><div><DialogTitle>Instagram preview</DialogTitle><DialogDescription>See your current design and caption in a sample feed.</DialogDescription></div><div className={styles.switch} aria-label="Preview device"><button aria-pressed={device==='mobile'} onClick={()=>setDevice('mobile')}><Smartphone size={15}/> Mobile</button><button aria-pressed={device==='web'} onClick={()=>setDevice('web')}><Monitor size={15}/> Web</button></div></div><div className={styles.stage}><div className={styles.frame} data-device={device}>
    {device==='web'&&<aside className={styles.sidebar} aria-hidden="true"><b>Instagram</b>{[[Home,'Home'],[Search,'Search'],[Compass,'Explore'],[Send,'Messages'],[Heart,'Notifications'],[PlusSquare,'Create']].map(([Icon,title])=>{const Glyph=Icon as typeof Home;return <span key={String(title)}><Glyph size={21}/>{String(title)}</span>;})}<span className={styles.more}><Menu size={21}/> More</span></aside>}
    <div className={styles.feed}>{device==='mobile'&&<div className={styles.mobileHeader} aria-hidden="true"><b>Instagram</b><Heart size={20}/><Send size={20}/></div>}<article className={styles.post}><header><span className={styles.avatar}>{brandName.charAt(0).toUpperCase()}</span><strong>{brandName}</strong><MoreHorizontal size={20}/></header><div className={styles.media} onTouchStart={e=>{touch.current=e.touches[0].clientX;}} onTouchEnd={e=>{if(touch.current!==null){const dx=e.changedTouches[0].clientX-touch.current;if(Math.abs(dx)>40)move(dx<0?1:-1);touch.current=null;}}}>
      {images[index]?<img src={images[index]} alt={`Instagram ${artifact.type==='carousel'?`slide ${index+1} of ${total}`:'post'} preview`}/>:<div className={styles.loading} role={error?'alert':'status'}>{error?<><span>{error}</span><button onClick={()=>setRetry(value=>value+1)}>Try again</button></>:<><LoaderCircle size={22}/><span>Rendering slide {index+1}…</span></>}</div>}
      {total>1&&<><span className={styles.count}>{index+1} / {total}</span><button className={styles.previous} aria-label="Previous slide" disabled={index===0} onClick={()=>move(-1)}><ChevronLeft size={18}/></button><button className={styles.next} aria-label="Next slide" disabled={index===total-1} onClick={()=>move(1)}><ChevronRight size={18}/></button></>}
    </div><div className={styles.postActions} aria-hidden="true"><Heart/><MessageCircle/><Send/><Bookmark/></div>{total>1&&<div className={styles.dots} aria-label="Choose preview slide">{Array.from({length:total},(_,i)=><button key={i} aria-label={`Preview slide ${i+1}`} aria-current={index===i?'true':undefined} onClick={()=>setIndex(i)}/>)}</div>}{artifact.caption&&<p className={styles.caption}><strong>{brandName}</strong>{' '}{expanded?artifact.caption:artifact.caption.slice(0,150)}{artifact.caption.length>150&&<button onClick={()=>setExpanded(value=>!value)}>{expanded?' less':'… more'}</button>}</p>}<p className={styles.sample}>Preview · Your current draft</p></article>{device==='mobile'&&<div className={styles.mobileNav} aria-hidden="true"><Home/><Search/><PlusSquare/><Compass/><span className={styles.avatar}>{brandName.charAt(0)}</span></div>}</div>
    </div></div><p className={styles.note}>Images use the same renderer as your export. Instagram’s interface and cropping may vary by device.</p></DialogContent></Dialog>;
}
