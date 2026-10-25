"use client";

import { useEffect, useRef, useState } from 'react';
import { SemanticComponentSchema } from '@/lib/schemas';
import type { CanvasObject } from '@/lib/freeform-canvas';
import { SemanticComponentFields } from './semantic-component-fields';
import styles from './component-inspector.module.css';

type Component=NonNullable<CanvasObject['component']>;
/** Keep temporarily invalid chart data local; only valid documents enter autosave. */
export function ComponentInspector({component,companyId,accent,onChange,onEditingChange}:{component:Component;companyId:string;accent:string;onChange:(value:Component,group:string)=>void;onEditingChange:(value:boolean)=>void}) {
  const [draft,setDraft]=useState(component),[focused,setFocused]=useState(false);
  const lastEmitted=useRef(JSON.stringify(component)),group=useRef('');
  const signature=JSON.stringify(component),validation=SemanticComponentSchema.safeParse(draft);
  useEffect(()=>{if(signature!==lastEmitted.current){lastEmitted.current=signature;setDraft(component);}},[signature,component]);
  useEffect(()=>{onEditingChange(focused||!validation.success);return()=>onEditingChange(false);},[focused,validation.success,onEditingChange]);
  function update(patch:Partial<Component>){
    const next={...draft,...patch};setDraft(next);
    const parsed=SemanticComponentSchema.safeParse(next);
    if(parsed.success){lastEmitted.current=JSON.stringify(parsed.data);onChange(parsed.data,group.current||crypto.randomUUID());}
  }
  return <div data-component-settings className={styles.fields} onFocusCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null)){group.current=crypto.randomUUID();setFocused(true);}}} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false);}}>
    <p className={styles.hint}>Changes update the canvas automatically.</p>
    {!validation.success&&<div className={styles.validation}><p role="status">Finish correcting the fields below to save these changes. The canvas keeps your last valid version.</p><button onClick={()=>{setDraft(component);lastEmitted.current=signature;}}>Reset unfinished changes</button></div>}
    <SemanticComponentFields component={draft} companyId={companyId} accent={accent} onChange={update}/>
  </div>;
}
