import { z } from 'zod';

export const TextboxColorSchema = z.union([z.string().regex(/^#[\da-f]{6}$/i), z.enum(['background','alternate','accent','ink','dark'])]);
export const TEXTBOX_PRESET_IDS = ['plain','soft-highlight','outline','rounded-callout','pill','dashed-note','dotted-note','double-frame','accent-callout','dark-callout'] as const;
export type TextboxPresetId = typeof TEXTBOX_PRESET_IDS[number];
const Padding = z.number().min(0).max(120);
/** Lengths are design pixels at a 1080px short edge; opacity is 0..1. */
export const TextboxStyleSchema = z.object({
  preset: z.enum(TEXTBOX_PRESET_IDS).optional(),
  fill: z.union([TextboxColorSchema,z.literal('none')]).optional(), fillShade: z.number().min(-1).max(1).optional(), fillOpacity: z.number().min(0).max(1).optional(),
  borderStyle: z.enum(['none','solid','dashed','dotted','double']).optional(),
  borderColor: TextboxColorSchema.optional(), borderShade: z.number().min(-1).max(1).optional(),
  borderWidth: z.number().min(0).max(16).optional(), borderOpacity: z.number().min(0).max(1).optional(),
  radius: z.union([z.number().min(0).max(160),z.literal('pill')]).optional(),
  padding: z.object({top:Padding,right:Padding,bottom:Padding,left:Padding}).partial().strict().optional(),
}).strict();
export type TextboxStyle = z.infer<typeof TextboxStyleSchema>;
/** Presets provide box defaults only; font, size, alignment and decorations remain independent. */
export const TEXTBOX_PRESETS:ReadonlyArray<{id:TextboxPresetId;name:string;description:string;style:Omit<TextboxStyle,'preset'>}> = [
  {id:'plain',name:'Plain',description:'Unboxed headlines and ordinary prose.',style:{}},
  {id:'soft-highlight',name:'Soft highlight',description:'A gentle brand tint for one useful takeaway.',style:{fill:'accent',fillShade:.92,radius:12,padding:{top:16,right:24,bottom:16,left:24}}},
  {id:'outline',name:'Outline',description:'A crisp frame for a definition or important statement.',style:{borderStyle:'solid',borderColor:'ink',borderWidth:2,padding:{top:20,right:28,bottom:20,left:28}}},
  {id:'rounded-callout',name:'Rounded callout',description:'A quiet filled and bordered callout for grouped supporting copy.',style:{fill:'alternate',borderStyle:'solid',borderColor:'ink',borderWidth:2,radius:24,padding:{top:24,right:32,bottom:24,left:32}}},
  {id:'pill',name:'Pill',description:'A short action or label; avoid long paragraphs.',style:{fill:'accent',fillShade:.9,radius:'pill',padding:{top:14,right:32,bottom:14,left:32}}},
  {id:'dashed-note',name:'Dashed note',description:'A tentative idea or working note with a visible dashed boundary.',style:{fill:'alternate',fillOpacity:.5,borderStyle:'dashed',borderColor:'ink',borderWidth:2,borderOpacity:.8,radius:16,padding:{top:24,right:28,bottom:24,left:28}}},
  {id:'dotted-note',name:'Dotted note',description:'A light annotation or optional aside.',style:{borderStyle:'dotted',borderColor:'ink',borderWidth:3,borderOpacity:.8,radius:12,padding:{top:20,right:28,bottom:20,left:28}}},
  {id:'double-frame',name:'Double frame',description:'A formal quotation or principle; use sparingly.',style:{borderStyle:'double',borderColor:'ink',borderWidth:6,padding:{top:28,right:32,bottom:28,left:32}}},
  {id:'accent-callout',name:'Accent callout',description:'A strong brand-colored action or emphasis with contrast-safe text.',style:{fill:'accent',radius:16,padding:{top:24,right:32,bottom:24,left:32}}},
  {id:'dark-callout',name:'Dark callout',description:'A high-contrast statement or closing action.',style:{fill:'dark',radius:12,padding:{top:28,right:32,bottom:28,left:32}}},
];

/** Sparse overrides inherit preset defaults; detaching returns editable values without a preset lock. */
export function expandTextboxStyle(style:TextboxStyle):Omit<TextboxStyle,'preset'> {
  const {preset,...raw}=style,defaults=preset?TEXTBOX_PRESETS.find(p=>p.id===preset)!.style:{};
  const overrides=Object.fromEntries(Object.entries(raw).filter(([,v])=>v!==undefined)) as Omit<TextboxStyle,'preset'>;
  const result={...defaults,...overrides};
  if(defaults.padding||overrides.padding)result.padding={...defaults.padding,...overrides.padding};
  return result;
}
/** A named preset starts a fresh base; {} explicitly clears the container. */
export function mergeTextboxStyle(base:TextboxStyle|undefined,patch:TextboxStyle|undefined):TextboxStyle|undefined {
  if(patch===undefined)return base;
  if(!Object.keys(patch).length)return {};
  const start=patch.preset?{}:base??{},result={...start,...patch};
  if(start.padding||patch.padding)result.padding={...start.padding,...patch.padding};
  return result;
}
export type ResolvedTextbox = {fill?:string;fillOpacity:number;borderStyle:'none'|'solid'|'dashed'|'dotted'|'double';borderColor:string;borderWidth:number;borderOpacity:number;radius:number|'pill';padding:{top:number;right:number;bottom:number;left:number}};
export type TextboxPalette = Record<'background'|'alternate'|'accent'|'ink'|'dark',string>;
export function shadeColor(color:string,shade=0) {
  return '#'+[1,3,5].map(i=>{const c=parseInt(color.slice(i,i+2),16);return Math.round(shade<0?c*(1+shade):c+(255-c)*shade).toString(16).padStart(2,'0');}).join('');
}
export function compositeColor(foreground:string,opacity:number,background:string) {
  return '#'+[1,3,5].map(i=>Math.round(parseInt(foreground.slice(i,i+2),16)*opacity+parseInt(background.slice(i,i+2),16)*(1-opacity)).toString(16).padStart(2,'0')).join('');
}
export function textboxColor(value:string,palette:TextboxPalette) {return value.startsWith('#')?value:palette[value as keyof TextboxPalette];}
export function resolveTextbox(style:TextboxStyle|undefined,palette:TextboxPalette,unit=1):ResolvedTextbox|undefined {
  if(!style)return;
  style=expandTextboxStyle(style);
  const color=(value:keyof TextboxPalette|string|undefined,fallback:string)=>value?(value.startsWith('#')?value:palette[value as keyof TextboxPalette]):fallback;
  const borderStyle=style.borderStyle??'none';
  return {fill:style.fill&&style.fill!=='none'?shadeColor(color(style.fill,palette.alternate),style.fillShade):undefined,fillOpacity:style.fillOpacity??1,
    borderStyle,borderColor:shadeColor(color(style.borderColor,palette.ink),style.borderShade),borderWidth:borderStyle==='none'?0:(style.borderWidth??2)*unit,borderOpacity:style.borderOpacity??1,
    radius:style.radius==='pill'?'pill':(style.radius??0)*unit,
    padding:{top:(style.padding?.top??0)*unit,right:(style.padding?.right??0)*unit,bottom:(style.padding?.bottom??0)*unit,left:(style.padding?.left??0)*unit}};
}
const rgba=(color:string,opacity:number)=>`rgba(${[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(',')},${opacity})`;
/** The typographic .2em top bearing is retained inside the explicit padding. */
export function textboxCss(box?:ResolvedTextbox) {
  if(!box)return {};
  return {backgroundColor:box.fill?rgba(box.fill,box.fillOpacity):'transparent',borderStyle:box.borderStyle,borderWidth:box.borderWidth,borderColor:rgba(box.borderColor,box.borderOpacity),borderRadius:box.radius==='pill'?99999:box.radius,
    paddingTop:`calc(${box.padding.top}px + .2em)`,paddingRight:box.padding.right,paddingBottom:box.padding.bottom,paddingLeft:box.padding.left,backgroundClip:'padding-box' as const};
}
export function textboxCssText(box?:ResolvedTextbox) {
  return Object.entries(textboxCss(box)).map(([key,value])=>`${key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${typeof value==='number'?value+'px':value};`).join('');
}
export function textboxGuide() {
  return 'Choose a purposeful textbox starting point with typography.<role>.box:{preset:"ID"}. Presets: '+TEXTBOX_PRESETS.map(p=>`${p.id} (${p.description})`).join('; ')+'. Prefer plain for ordinary prose; do not add a box simply to fill space. Presets are defaults, never locks. Override any property alongside preset, for example box:{preset:"rounded-callout",radius:36,borderWidth:3,padding:{left:40}}. Changing preset starts fresh defaults; a repair without preset edits the existing treatment. Each typography role independently supports size, width, leading, tracking, align, bold, italic, underline and text color. box accepts fill:palette token|"#RRGGBB"|"none",fillShade:-1..1,fillOpacity:0..1,borderStyle:"none"|"solid"|"dashed"|"dotted"|"double",borderColor:palette token or hex,borderShade:-1..1,borderWidth:0..16,borderOpacity:0..1,radius:0..160 or "pill",padding:{top:0..120,right:0..120,bottom:0..120,left:0..120}; individual padding sides may be omitted to inherit. Palette tokens: background,alternate,accent,ink,dark. fill:"none" removes an inherited fill; borderStyle:"none" removes an inherited border. Positive shade blends toward white, negative toward black. Lengths are pixels at a 1080px short edge. An explicit box replaces a legacy panel on the same role. Padding participates in measured layout. Keep double borders at least 3px wide. Fill/border opacity do not fade text. The renderer chooses readable text by default; explicit text colors and accents must contrast with the composited fill. Preserve canonical wording.';
}
