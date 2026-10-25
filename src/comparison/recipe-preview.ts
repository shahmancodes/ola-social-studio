/** Preview-only prototypes. Nothing in production generation imports this catalogue. */
import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
import { LAB_DIR, assertIsolation } from './config';import { getAttempt } from './store';
import { db } from '../lib/platform-db';import { getCompany }from'../lib/platform';import { contentBrand,type ContentBrand }from'../lib/content-brand';
import { composePage }from'../lib/composition';import{buildVisualScene,scenePng,sceneSvg,type VisualScene,type SceneElement}from'../lib/content-layout';import{formatGeometry,type VisualFormat}from'../lib/responsive-layout';import{sceneIssues}from'../lib/scene-renderer';
const formats=['poster','story','carousel']as const;
const recipes=[
 {id:'connected-process',name:'Connected process',purpose:'Make an ordered sequence legible as one diagram.',capacity:'3–6 short stages; optional brief stage details. Vertical spine on Story, horizontal path on Poster/Carousel.',brand:'GitLab'},
 {id:'image-editorial',name:'Image editorial',purpose:'Give the supplied image a clear focal role, followed by a compact reading sequence.',capacity:'One supplied image, a short headline, supporting copy, action and credit. Original image is contained.',brand:'NASA'},
 {id:'practical-checklist',name:'Practical checklist',purpose:'Turn useful advice into a small set of concrete actions.',capacity:'2–4 approved actions with short details. Use only when the brief permits that content.',brand:'GitHub'},
 {id:'strong-statement',name:'Strong statement',purpose:'Give one message a distinct, bold typographic hierarchy.',capacity:'One short headline, one supporting sentence and an optional action. No diagram required.',brand:'GitHub'},
]as const;
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function base(format:VisualFormat,brand:ContentBrand){
 const g=formatGeometry(format),rules=brand.designSystem,alias=(id:string|undefined)=>id?(brand.assetAliases?.[id]??id):undefined;
 const scene:VisualScene={width:g.width,height:g.height,background:brand.palette.background,elements:[],measured:true,compositionVersion:1,fonts:brand.fonts,headingFontId:alias(rules?.headingFontId??brand.fonts?.find(f=>f.name===rules?.headingFontName)?.id),bodyFontId:alias(rules?.bodyFontId??brand.fonts?.find(f=>f.name===rules?.bodyFontName)?.id)};
 if(brand.logo)scene.elements.push({kind:'image',id:'logo',x:g.pad,y:format==='story'?296:g.pad,w:220*g.unit,h:70*g.unit,bytes:await sharp(await fs.readFile(brand.logo.diskPath)).png().toBuffer()});
 return {scene,...g};
}
const txt=(scene:VisualScene,id:string,text:string,x:number,y:number,w:number,h:number,size:number,color:string,bold=false)=>scene.elements.push({kind:'text',id,copyId:id,copySource:id,x,y,w,h,size,minSize:id==='title'?42:24,fontFamily:bold?'OlaHeading':'OlaBody',weight:bold?'bold':'regular',color,text,lines:[]});
async function prototype(id:typeof recipes[number]['id'],format:typeof formats[number],brand:ContentBrand){
 if(id==='connected-process'||id==='practical-checklist'){
  const process=id==='connected-process';
  const page=composePage(process?{title:'Keep the work moving.',body:'Plan → Build → Review → Learn',cta:'Improve one handoff today.'}:{title:'Make the next review easier.',body:'',cta:'Start with one change.',visualContent:{kind:'checklist',items:[{label:'Name the goal',detail:'Explain the reason for the change.'},{label:'Show the checks',detail:'List what you tested and any gaps.'},{label:'Ask one question',detail:'Point reviewers to a specific decision.'}]}},{family:'diagram-led',intent:{goal:process?'Show a connected ordered process':'Give three practical review actions',relationship:process?'sequence':'statement',reason:'Use explicit relationships and group related content.'},bodyMode:process?'sequence':'text',...(process?{separator:' → '}:{}),tuning:{align:'left',density:'compact',scale:1},responsive:{version:1,anchor:'center',gap:.025,focal:'artwork',visualWeight:.55,visual:{treatment:'cards',direction:process&&format!=='story'?'horizontal':'vertical'}}});
  return buildVisualScene(format,page,brand);
 }
 const {scene,frame,unit:u}=await base(format,brand),p=brand.palette;
 if(id==='strong-statement'){
  const x=frame.x+34*u,w=frame.w-34*u,titleY=frame.y+frame.h*.1,titleH=frame.h*.53;
  scene.elements.push({kind:'rect',id:'statement-rule',x:frame.x,y:titleY,w:7*u,h:titleH+140*u,fill:p.accent});
  txt(scene,'title','Make review easier.',x,titleY,w,titleH,(format==='poster'?150:134)*u,p.ink,true);
  txt(scene,'body','Give reviewers the context they need to understand the change.',x,titleY+titleH+26*u,w*.88,140*u,38*u,p.ink);
  txt(scene,'cta','Start with one focused change.',x,Math.min(frame.y+frame.h-54*u,titleY+titleH+198*u),w,54*u,29*u,p.accent,true);
 }else{
  const asset=brand.assets.find(a=>a.mediaType.startsWith('image/'));if(!asset)throw new Error('Image editorial preview needs the frozen image.');
  const bytes=await sharp(await fs.readFile(asset.diskPath)).png().toBuffer(),m=await sharp(bytes).metadata();
  const imageH=Math.min(frame.h*.43,frame.w*m.height!/m.width!),imageW=imageH*m.width!/m.height!,gap=24*u,headingH=190*u,bodyH=112*u,ctaH=48*u,creditH=32*u;
  const used=imageH+headingH+bodyH+ctaH+creditH+gap*4,y=frame.y+Math.max(0,(frame.h-used)/2);
  scene.elements.push({kind:'image',id:'artwork',x:frame.x+(frame.w-imageW)/2,y,w:imageW,h:imageH,bytes});
  txt(scene,'title','Look closer before you conclude.',frame.x,y+imageH+gap,frame.w,headingH,82*u,p.ink,true);
  txt(scene,'body','Notice the light, texture, and horizon. Separate what you can see from what you infer.',frame.x,y+imageH+headingH+gap*2,frame.w,bodyH,32*u,p.ink);
  txt(scene,'cta','Save this observation prompt.',frame.x,y+imageH+headingH+bodyH+gap*3,frame.w,ctaH,28*u,p.accent,true);
  txt(scene,'credit','Image: NASA',frame.x,y+imageH+headingH+bodyH+ctaH+gap*4,frame.w,creditH,20*u,p.ink);
 }
 // Measure first so prototype copy groups hug actual text rather than reserved boxes.
 await scenePng(scene);
 const texts=['title','body','cta',...(id==='image-editorial'?['credit']:[])].map(id=>scene.elements.find(e=>e.id===id)!).filter((e):e is Extract<SceneElement,{kind:'text'}>=>e.kind==='text');
 let cursor=id==='image-editorial'?(()=>{const image=scene.elements.find(e=>e.id==='artwork')!;return image.y+('h'in image?image.h:0)+24*u;})():texts[0].y;
 for(const e of texts){e.y=cursor;cursor+=e.h+(e.id==='title'?30:24)*u;}
 const rule=scene.elements.find(e=>e.id==='statement-rule');if(rule?.kind==='rect')rule.h=texts[1].y+texts[1].h-rule.y;
 return scene;
}
export async function buildRecipePreviews(){
 assertIsolation();const dir=path.join(LAB_DIR,'recipe-previews');await fs.mkdir(dir,{recursive:true});
 const batch=JSON.parse(await fs.readFile(path.join(LAB_DIR,'representation-live','manifest.json'),'utf8'));
 const brands=new Map<string,ContentBrand>();
 for(const c of batch.cases){const a=getAttempt(c.freshAttemptId),row=db().prepare('SELECT company_id,brand_snapshot_json,brief FROM projects WHERE id=?').get(a.projectId!)as{company_id:string;brand_snapshot_json:string;brief:string};brands.set(c.company,contentBrand(row.company_id,getCompany(row.company_id)!.name,JSON.parse(row.brand_snapshot_json),row.brief));}
 const items:Array<{id:string;recipeId:typeof recipes[number]['id'];format:typeof formats[number];width:number;height:number;fonts:VisualScene['fontReport'];checks:string}>=[];
 for(const recipe of recipes)for(const format of formats){const scene=await prototype(recipe.id,format,brands.get(recipe.brand)!);const png=await scenePng(scene);const issues=sceneIssues(scene);if(issues.length)throw new Error(`${recipe.id}/${format}: ${issues.join(' ')}`);const id=`${recipe.id}-${format}`;await fs.writeFile(path.join(dir,id+'.png'),png);await fs.writeFile(path.join(dir,id+'.svg'),sceneSvg(scene));items.push({id,recipeId:recipe.id,format,width:scene.width,height:scene.height,fonts:scene.fontReport,checks:'measured text fit, contrast, collisions and format safety passed'});}
 const manifest={createdAt:new Date().toISOString(),status:'preview-only; not registered with generation',recipes,items};await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ola · Recipe previews</title><style>*{box-sizing:border-box}body{margin:0;background:#f2f0ec;color:#24222b;font:15px/1.5 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:32px}h1{font-size:38px;letter-spacing:-1px}a{color:#493b96}nav{display:flex;gap:24px;flex-wrap:wrap}.notice{background:#fff4d9;border:1px solid #d8bc76;padding:18px;max-width:1000px}.intro{max-width:1000px}section{margin:48px 0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}figure{margin:0;background:white;padding:16px;border-radius:12px;border:1px solid #ddd8d0}img{width:100%;height:auto;display:block}figcaption{font-size:12px;color:#625d6b;margin-top:12px}h3{margin:0 0 12px}details{margin:14px 0}pre{white-space:pre-wrap;font-size:11px}@media(max-width:760px){main{padding:16px}.grid{grid-template-columns:1fr}h1{font-size:30px}}</style></head><body><main><a href="/">← Ola Sentinel</a><h1>Four design recipes to review</h1><p class="notice"><strong>Preview only.</strong> These prototypes are separate from the generation pipeline. Review them before integration. The process-diagram repair is a shared component fix and is being tested separately.</p><p class="intro">The first four recipes from the proposed library, shown in Poster, Story and Carousel dimensions. Preview copy illustrates the layouts; it does not replace or modify any frozen comparison brief. Fonts come from the existing company snapshots. Images open at full size.</p><nav>${recipes.map(r=>`<a href="#${r.id}">${esc(r.name)}</a>`).join('')}</nav>${recipes.map(r=>`<section id="${r.id}"><h2>${esc(r.name)}</h2><p>${esc(r.purpose)}</p><p class="intro">${esc(r.capacity)} Text, brand fonts, palette, logo and content slots are intended to remain editable when integrated.</p><div class="grid">${items.filter(i=>i.recipeId===r.id).map(i=>`<figure><h3>${esc(i.format)}</h3><a href="/api/recipe-preview-file/${i.id}" target="_blank" rel="noopener"><img src="/api/recipe-preview-file/${i.id}" alt="${esc(r.name)} ${i.format} prototype"></a><figcaption>${i.width} × ${i.height} · ${esc(r.brand)} snapshot · click for full size</figcaption><details><summary>Preview checks and fonts</summary><pre>${esc(JSON.stringify(i,null,2))}</pre></details></figure>`).join('')}</div></section>`).join('')}</main></body></html>`;
 await fs.writeFile(path.join(dir,'index.html'),html);return manifest;
}
