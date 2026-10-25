'use client';

import {useEffect,useState} from 'react';
import {TEXTBOX_PRESETS,resolveTextbox,textboxCss,compositeColor} from '@ola/lib/textbox-style';
import {readableInk} from '@ola/lib/brand-design';
import {TextboxControls} from '@ola/components/textbox-controls';
import type {TextAppearance} from '@ola/lib/editor-appearance';
import type {CanvasText} from '@ola/lib/canvas-text';
import controls from '@ola/components/canvas-controls.module.css';
import styles from './presets.module.css';

const palette={background:'#ffffff',alternate:'#eef0f5',accent:'#2954d1',ink:'#172033',dark:'#172033'};
export function TextboxPresetGallery(){
 const [appearance,setAppearance]=useState<TextAppearance>({box:{preset:'rounded-callout'}}),[text,setText]=useState('Give one useful idea a clear place to land.');
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('preset');if(TEXTBOX_PRESETS.some(p=>p.id===id))setAppearance(v=>({...v,box:{preset:id as typeof TEXTBOX_PRESETS[number]['id']}}));},[]);
 const box=resolveTextbox(appearance.box,palette,.5),fill=box?.fill?compositeColor(box.fill,box.fillOpacity,palette.background):palette.background;
 const ink=appearance.color??readableInk(fill,palette.ink);
 const target:CanvasText={id:'preview',elementIndex:0,source:'body',text,x:0,y:0,width:600,height:120,fontSize:appearance.fontSize??24,fontFamily:'Arial',fontWeight:appearance.bold?700:400,color:ink,align:appearance.align??'left',typography:{box:appearance.box},textbox:box,underline:appearance.underline,italic:appearance.italic};
 return <main className={styles.page}><a href="/assets?category=textboxes">← Textbox presets in Assets</a><h1>Ten starting points. Every detail editable.</h1><p>Agents choose a treatment, then adjust it to the message. The editor keeps custom colors, borders, spacing, text sizes and decorations available.</p>
  <div className={styles.grid}>{TEXTBOX_PRESETS.map(p=>{const b=resolveTextbox({preset:p.id},palette,.4),surface=b?.fill?compositeColor(b.fill,b.fillOpacity,palette.background):palette.background;return <button type="button" key={p.id} className={styles.card} aria-label={`Try ${p.name}`} aria-pressed={appearance.box?.preset===p.id} onClick={()=>setAppearance(current=>({...current,box:{preset:p.id}}))}><span className={styles.sample}><span style={{...textboxCss(b),color:readableInk(surface,palette.ink)}}>One clear idea</span></span><strong>{p.name}</strong><span>{p.description}</span></button>;})}</div>
  <section className={styles.workbench}><h2>Try it, then make it yours</h2><p>Choose a starting style above. Open Textbox for every box property; Make custom detaches the preset while preserving its current appearance. This preview does not change saved projects.</p>
   <div className={styles.editors}><label>Preview text<textarea aria-label="Preview text" value={text} onChange={e=>setText(e.target.value)}/></label><div className={styles.typeControls}><label>Text size<input type="number" aria-label="Preview text size" min={12} max={180} value={appearance.fontSize??24} onChange={e=>{const n=Number(e.target.value);if(n>=12&&n<=180)setAppearance(v=>({...v,fontSize:n}));}}/></label><label>Text color<input type="color" aria-label="Preview text color" value={ink} onChange={e=>setAppearance(v=>({...v,color:e.target.value}))}/></label>{(['bold','italic','underline'] as const).map(key=><label key={key}><input type="checkbox" aria-label={`Preview ${key}`} checked={appearance[key]??false} onChange={e=>setAppearance(v=>({...v,[key]:e.target.checked}))}/>{key}</label>)}<button type="button" onClick={()=>setAppearance(v=>({...v,color:undefined}))}>Automatic text color</button></div></div>
   <div className={`${controls.toolbar} ${styles.toolbar}`}><TextboxControls target={target} appearance={appearance} onStyle={patch=>setAppearance(current=>({...current,...patch}))}/></div>
   <div className={styles.stage}><div data-preset-preview style={{...textboxCss(box),boxSizing:'border-box',paddingTop:box?`calc(${box.padding.top}px + .2em)`:'.2em',fontSize:target.fontSize,fontWeight:target.fontWeight,fontStyle:appearance.italic?'italic':'normal',textDecoration:appearance.underline?'underline':'none',color:ink,lineHeight:1.3,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</div></div>
   <details><summary>Current editable appearance</summary><pre>{JSON.stringify(appearance,null,2)}</pre></details>
  </section>
  <section><h2>Agent choices stay editable</h2><p>For example, an agent can choose Rounded callout, widen its left padding, change the border and underline the text. It can also start with a custom box.</p><pre>{JSON.stringify({typography:{body:{box:{preset:'rounded-callout',borderWidth:3,padding:{left:40}},size:1.1,underline:true}}},null,2)}</pre></section>
 </main>;
}
