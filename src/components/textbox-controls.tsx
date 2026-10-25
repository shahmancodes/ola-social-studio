"use client";

import type { CanvasText } from '@/lib/canvas-text';
import type { TextAppearance } from '@/lib/editor-appearance';
import { TEXTBOX_PRESETS, expandTextboxStyle, mergeTextboxStyle, type TextboxStyle, type TextboxPresetId } from '@/lib/textbox-style';
import styles from './canvas-controls.module.css';

export function TextboxControls({target,appearance,onStyle,inline=false}:{target:Pick<CanvasText,'typography'|'textbox'>;appearance?:TextAppearance;onStyle:(patch:TextAppearance)=>void;inline?:boolean}) {
  const source=mergeTextboxStyle(target.typography?.box,appearance?.box)??{};
  const box=expandTextboxStyle(source),preset=TEXTBOX_PRESETS.find(p=>p.id===source.preset);
  const patch=(value:Partial<TextboxStyle>)=>onStyle({box:mergeTextboxStyle(source,value)});
  const color=(value:string|undefined,resolved:string|undefined,fallback:string)=>value?.startsWith('#')?value:resolved??fallback;
  const number=(label:string,key:'fillShade'|'fillOpacity'|'borderShade'|'borderWidth'|'borderOpacity',fallback:number,min:number,max:number,step:number)=><label className={styles.inlineLabel}>{label}<input type="number" aria-label={label} min={min} max={max} step={step} value={box[key]??fallback} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=min&&n<=max)patch({[key]:n});}}/></label>;
  return <details className={styles.menu} open={inline||undefined}><summary>Textbox</summary><div className={`${styles.popover} ${styles.textboxControls}`} style={inline?{position:'static',width:'100%',maxWidth:'none',maxHeight:'none',border:0,boxShadow:'none',padding:0}:undefined}>
    <label className={styles.inlineLabel}>Starting style<select aria-label="Textbox preset" value={source.preset??'custom'} onChange={e=>onStyle({box:e.target.value==='custom'?expandTextboxStyle(source):{preset:e.target.value as TextboxPresetId}})}><option value="custom">Custom</option>{TEXTBOX_PRESETS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <p className={styles.hint}>{preset?.description??'Edit every property freely.'}</p>
    <div className={styles.segmented}><button type="button" onClick={()=>onStyle({box:{preset:'plain'}})}>Plain</button>{source.preset&&<><button type="button" onClick={()=>onStyle({box:{preset:source.preset}})}>Reset style</button><button type="button" onClick={()=>onStyle({box:expandTextboxStyle(source)})}>Make custom</button></>}</div>
    <label className={styles.check}><input type="checkbox" aria-label="Textbox fill" checked={Boolean(box.fill&&box.fill!=='none')} onChange={e=>patch({fill:e.target.checked?'alternate':'none'})}/> Fill</label>
    {box.fill&&box.fill!=='none'&&<><label className={styles.inlineLabel}>Fill color<input type="color" aria-label="Textbox fill color" value={color(box.fill,target.textbox?.fill,'#eeeeee')} onChange={e=>patch({fill:e.target.value,fillShade:0})}/></label>{number('Fill shade','fillShade',0,-1,1,.05)}{number('Fill opacity','fillOpacity',1,0,1,.05)}</>}
    <label className={styles.inlineLabel}>Border<select aria-label="Textbox border" value={box.borderStyle??'none'} onChange={e=>patch({borderStyle:e.target.value as TextboxStyle['borderStyle']})}>{['none','solid','dashed','dotted','double'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    {box.borderStyle&&box.borderStyle!=='none'&&<><label className={styles.inlineLabel}>Border color<input type="color" aria-label="Textbox border color" value={color(box.borderColor,target.textbox?.borderColor,'#111111')} onChange={e=>patch({borderColor:e.target.value,borderShade:0})}/></label>{number('Border width','borderWidth',2,0,16,1)}{number('Border shade','borderShade',0,-1,1,.05)}{number('Border opacity','borderOpacity',1,0,1,.05)}</>}
    <label className={styles.inlineLabel}>Corner radius<input type="number" aria-label="Textbox corner radius" min={0} max={160} value={box.radius==='pill'?160:box.radius??0} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<=160)patch({radius:n});}}/></label>
    <label className={styles.check}><input type="checkbox" aria-label="Pill corners" checked={box.radius==='pill'} onChange={e=>patch({radius:e.target.checked?'pill':0})}/> Pill corners</label>
    <p className={styles.groupLabel}>Padding</p>{(['top','right','bottom','left'] as const).map(side=><label className={styles.inlineLabel} key={side}>{side[0].toUpperCase()+side.slice(1)}<input type="number" aria-label={`Textbox padding ${side}`} min={0} max={120} value={box.padding?.[side]??0} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<=120)patch({padding:{top:0,right:0,bottom:0,left:0,...box.padding,[side]:n}});}}/></label>)}
  </div></details>;
}
