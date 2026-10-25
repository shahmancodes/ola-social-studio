import {lineSegments,segmentCrossesBox} from './design-primitives';
import {semanticTextCapacities,refitSemanticTextFlow} from './semantic-design-fit';
import { textboxCssText, compositeColor } from './textbox-style';
import { CANVAS_TYPOGRAPHY_CSS } from "./canvas-typography";
import { typographyHtml } from './design-typography';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT_DIR } from './paths';
import type { VisualScene, SceneElement } from './content-layout';
import { sceneSvg } from './content-layout';
import { contrast } from './brand-design';
import { storyTextIsSafe } from './story-safe-area';
import { resolveResponsiveScene, finalizeResponsiveScene, reflowReadableProcess } from './responsive-layout';
import sharp from 'sharp';
import { recipeCredit } from './design-recipes';
import {fontFaceMetadata} from './font-face-metadata';
import {fontFaceDescriptorCss} from './font-catalog';

export async function sceneFontCss(scene: VisualScene) {
  const fonts=scene.fonts??[];
  for(const id of [scene.headingFontId,scene.bodyFontId]) if(id&&!fonts.some(f=>f.id===id))throw new Error('Selected font is not in this company snapshot.');
  const heading=fonts.find(f=>f.id===scene.headingFontId)??fonts.find(f=>/bold|display/i.test(f.name))??fonts.find(f=>!/mono/i.test(f.name))??fonts[0];
  const body=fonts.find(f=>f.id===scene.bodyFontId)??fonts.find(f=>/text/i.test(f.name))??fonts.find(f=>!/bold|mono/i.test(f.name))??fonts[0];
  const names:string[]=[];
  const css=await Promise.all([['OlaHeading',heading],['OlaBody',body]].map(async([family,font])=>{
    const f=font as typeof heading;const file=f?.diskPath??path.join(ROOT_DIR,'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2');
    const bytes=await fs.readFile(file);if(bytes.length>15*1024*1024)throw new Error('Font file is too large.');
    names.push(`${family}: ${f?.name??'Manrope (bundled fallback)'}`);
    const mime=f?.mediaType??'font/woff2';
    return `@font-face{font-family:${family};src:url(data:${mime};base64,${bytes.toString('base64')});${fontFaceDescriptorCss(fontFaceMetadata(bytes))}font-display:block}`;
  }));scene.fontReport=names;return css.join('')+(scene.additionalFontCss??'');
}

function box(e:SceneElement){if(e.kind==='text'&&!e.textbox&&e.inkBounds)return {x:e.x+e.inkBounds.x,y:e.y+e.inkBounds.y,w:e.inkBounds.w,h:e.inkBounds.h};if(e.kind==='line'){const points=lineSegments(e).flatMap(s=>[{x:s.x,y:s.y},{x:s.x2,y:s.y2}]);if(!points.length)return{x:e.x,y:e.y,w:0,h:0};const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y};}return e;}
function intersects(a:ReturnType<typeof box>,b:ReturnType<typeof box>){return Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>2;}
export function sceneIssues(scene:VisualScene) {
  const issues:string[]=[];const texts=scene.elements.filter(e=>e.kind==='text');
  for(const e of scene.elements){const b=box(e);if(b.x<0||b.y<0||b.x+b.w>scene.width+.5||b.y+b.h>scene.height+.5)issues.push(`${e.id??e.kind} extends outside the canvas.`);}
  for(const e of texts){if(e.kind!=='text')continue;
    if(scene.height===1920&&!storyTextIsSafe(box(e)))issues.push(`${e.id} is outside Story safe areas.`);
    const bounds=box(e);
    const background=scene.elements.filter(v=>v.kind==='rect'&&v.x<=bounds.x&&v.y<=bounds.y&&v.x+v.w>=bounds.x+bounds.w&&v.y+v.h>=bounds.y+bounds.h).at(-1);
    const base=background?.kind==='rect'?background.fill:scene.background;
    const fill=e.textbox?.fill?compositeColor(e.textbox.fill,e.textbox.fillOpacity,base):base;
    if(contrast(fill,e.color)<4.5)issues.push(`${e.id} has insufficient text contrast.`);
    if(e.typography?.emphasis?.some(s=>s.treatment==='accent')&&e.accentColor&&contrast(fill,e.accentColor)<4.5)issues.push(`${e.id} emphasis has insufficient text contrast.`);
    for(const other of scene.elements){if(e===other)continue;if(other.kind==='text'&&scene.elements.indexOf(other)<scene.elements.indexOf(e))continue;
      if(other.kind==='text'||other.kind==='image'){if(intersects(box(e),box(other)))issues.push(`${e.id} overlaps ${other.id??other.kind}.`);}
      if(other.kind==='rect'&&scene.elements.indexOf(other)>scene.elements.indexOf(e)&&intersects(box(e),box(other)))issues.push(`${e.id} is obscured by a foreground shape.`);
      if(other.kind==='line'){
        if(lineSegments(other).some(s=>segmentCrossesBox(s,bounds,other.width/2-2)))issues.push(`${e.id} is crossed by a rule.`);
      }
    }
  }
  const layout = scene.responsiveLayout;
  if (layout) for (const g of layout.evidence?.groups ?? layout.groups) {
    const f = layout.frame;
    if (g.x < f.x - .5 || g.y < f.y - .5 || g.x + g.w > f.x + f.w + .5 || g.y + g.h > f.y + f.h + .5) issues.push(`${g.id} extends outside the usable content area.`);
  }
  return [...new Set(issues)];
}

/** Chromium loads the exact font bytes and measures glyphs before any raster export. No network is allowed. */
export async function renderMeasuredScene(scene: VisualScene) {
  const css=await sceneFontCss(scene);const browser=await chromium.launch({headless:true});
  try {const page=await browser.newPage({viewport:{width:scene.width,height:scene.height},deviceScaleFactor:1});await page.route('**/*',r=>r.abort());
    await page.setContent(`<style>${css}</style><span style="font-family:OlaHeading;font-weight:700">Font check</span><span style="font-family:OlaBody">Font check</span>`);
    await page.evaluate(async()=>{await Promise.all([...document.fonts].map(f=>f.load()));await document.fonts.ready;if([...document.fonts].some(f=>f.status!=='loaded'))throw new Error('A required brand font failed to load.');});
    // Measured height is an output of relational layout, not the next iteration's capacity.
    const capacities=new Map(scene.elements.filter(e=>e.kind==='text').map(e=>[e,e.h]));
    for (let iteration = 0; iteration < 8; iteration++) {
    const texts=scene.elements.filter((e): e is Extract<SceneElement,{kind:'text'}>=>e.kind==='text' && !e.layoutDecoration);
    for(const e of texts)if(!scene.freeform&&e.textbox&&e.w<=e.textbox.padding.left+e.textbox.padding.right+e.textbox.borderWidth*2)throw new Error('Textbox padding leaves no readable width: '+e.id);
    const semanticCapacities=semanticTextCapacities(scene);
    const items=texts.map(e=>({...e,...(scene.responsiveLayout?{h:semanticCapacities.get(e)??capacities.get(e)??e.h}:{}),boxCss:textboxCssText(e.textbox),html:typographyHtml(e.text,e.typography,e.accentColor)}));
    const measured=await page.evaluate<Array<{size:number;lines:string[];h:number;inkBounds:{x:number;y:number;w:number;h:number}}|{error:string;id:string}>>(String.raw`(({items,balance,typography,freeform})=>{
      return items.map(e=>{
        const el=document.createElement('div');
        el.style.cssText=typography+'position:absolute;left:0;top:0;width:'+e.w+'px;font-family:'+(e.fontFamily||'Arial,sans-serif')+';font-weight:'+(e.weight==='bold'?700:400)+';font-style:'+(e.italic?'italic':'normal')+';text-decoration:'+(e.underline?'underline':'none')+';text-align:'+(e.align||'left')+';text-wrap:'+(balance?'balance':'wrap');
        el.style.cssText+=e.boxCss;
        el.style.fontStyle=e.italic?'italic':'normal';el.style.textDecoration=e.underline?'underline':'none';
        el.style.lineHeight=String(e.typography?.leading??1.15);el.style.letterSpacing=(e.typography?.tracking??0)+'em';el.style.textWrap=e.typography?.wrap??(balance?'balance':'wrap');
        el.innerHTML=e.html;document.body.appendChild(el);
        const readLines=()=>{
          const lines=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let top=null,broken=false,left=Infinity,right=0,start=Infinity,end=0,previous='';
          let node;while(node=walker.nextNode())for(let i=0;i<node.textContent.length;i++){
            if(node.textContent[i]==='\n'){top=null;previous='\n';continue;}
            const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
            const rect=range.getBoundingClientRect();
            if(rect.width>0){left=Math.min(left,rect.left);right=Math.max(right,rect.right);start=Math.min(start,rect.top);end=Math.max(end,rect.bottom);}
            if(top===null||Math.abs(rect.top-top)>e.size*.35){if(top!==null&&previous&&!/[\s\-]/.test(previous)&&!/\s/.test(node.textContent[i]))broken=true;lines.push('');top=rect.top;}
            lines[lines.length-1]+=node.textContent[i];
            previous=node.textContent[i];
          }
          return {lines:lines.map(line=>line.trim()),broken,inkBounds:{x:Number.isFinite(left)?left:0,y:Number.isFinite(start)?start:0,w:Number.isFinite(left)?right-left:0,h:Number.isFinite(start)?end-start:0}};
        };
        let size=e.size,lines=[],inkBounds={x:0,y:0,w:0,h:0};const minimum=Math.min(size,e.minSize??(e.id==='title'?40:24));
        for(;;){el.style.fontSize=size+'px';const measured=readLines();lines=measured.lines;inkBounds=measured.inkBounds;
          const hardLines=(el.textContent.match(/\n/g)||[]).length+1;
          const phraseFits=!(e.id==='title'&&e.typography?.breakAfter?.length)||lines.length<=hardLines;
          const lineBudgetFits=!e.typography?.maxLines||lines.length<=e.typography.maxLines;
          const fits=freeform||el.getBoundingClientRect().height<=e.h+.5&&!measured.broken&&phraseFits&&lineBudgetFits;
          const orphan=balance&&e.id==='title'&&lines.length>1&&lines.some(line=>/^(a|an|the|and|or|to|of|in|for|with)$/i.test(line));
          if(fits&&(freeform||!orphan||size<=minimum))break;
          if(size<=minimum){const height=el.getBoundingClientRect().height;el.remove();return {id:e.id,error:'Text does not fit: '+e.id+' (minimum '+minimum.toFixed(1)+'px; region '+e.w.toFixed(1)+'×'+e.h.toFixed(1)+'px; measured '+lines.length+' lines, '+height.toFixed(1)+'px high'+(measured.broken?'; a word needs more width':'')+(!phraseFits?'; explicit headline breaks need more width':'')+(!lineBudgetFits?'; exceeds the '+e.typography.maxLines+'-line limit':'')+').'};}size=Math.max(minimum,size-2);
        }
        const h=el.getBoundingClientRect().height;el.remove();
        return {size,lines:lines.map(line=>line.trim()),h,inkBounds};
      });
    })(${JSON.stringify({items,freeform:!!scene.freeform,balance:scene.compositionVersion===1,typography:CANVAS_TYPOGRAPHY_CSS})})`);
    const failures=measured.filter((m):m is {error:string;id:string}=>'error'in m);
    if(failures.length){
      const reflows=failures.map(f=>reflowReadableProcess(scene,f.id));
      if(reflows.some(Boolean)&&iteration<7)continue;
      throw new Error(failures.map(f=>f.error).join(' '));
    }
    texts.forEach((e,i)=>Object.assign(e,measured[i],scene.freeform?{h:e.h}:{}));
    if(!scene.freeform&&refitSemanticTextFlow(scene)){
      if(iteration===7)throw Error('Related text cannot fit its clear region at readable sizes; reflow the diagram.');
      continue;
    }
    for(const e of scene.elements)if(e.kind==='rect'&&e.fitText){const text=texts.find(t=>t.id===e.fitText);if(text)e.h=Math.min(e.h,text.h+(e.textPadding??24)*2);}
    if (scene.freeform) break;
    const overflow = resolveResponsiveScene(scene, iteration);
    if (overflow <= .5) break;
    if (iteration === 7) throw new Error('Content cannot fit the usable canvas at readable sizes; choose a different composition or reduce approved copy.');
    let changed = false;
    for (const e of texts) if (e.kind === 'text' && e.groupId) { const next = Math.min(e.size, Math.max(e.minSize ?? 24, e.size * .88)); if (next < e.size - .01) changed = true; e.size = next; }
    for (const g of scene.responsiveLayout?.groups ?? []) if (g.visual && g.visual.imageHeight > 100) { g.visual.imageHeight *= .88; changed = true; }
    if (!changed) throw new Error('Content exceeds the readable layout capacity.');
    }
    if (!scene.freeform) finalizeResponsiveScene(scene);
    for (const e of scene.elements) if (e.absoluteOverride && !scene.responsiveLayout) {
      const {x,y}=e.absoluteOverride; if(x!==undefined)e.x=x;if(y!==undefined)e.y=y;
    }
    // Background cards and leaders sit behind their labels, including after a reflow.
    if (!scene.freeform) scene.elements = [...scene.elements.filter(e=>e.layoutDecoration), ...scene.elements.filter(e=>!e.layoutDecoration)];
    const issues=sceneIssues(scene);if(issues.length&&!scene.freeform)throw new Error(issues.join(' '));
    const svg=sceneSvg(scene).replace('<svg ', '<svg style="display:block" ');
    await page.setContent(`<style>html,body{margin:0;padding:0}${css}</style>${svg}`);await page.evaluate(()=>document.fonts.ready);
    const bytes=await page.screenshot({type:'png',animations:'disabled'});
    if(!scene.responsiveLayout?.recipe)return bytes;
    const credit=recipeCredit(scene.responsiveLayout.recipe.id),xml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
    const xmp=`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" dc:creator="${xml(credit.author)}" dc:source="${xml(credit.source)}" dc:description="${xml(credit.modifications)}"><cc:license rdf:resource="${xml(credit.licenseUrl)}"/></rdf:Description></rdf:RDF></x:xmpmeta>`;
    return sharp(bytes).withXmp(xmp).png().toBuffer();
  }finally{await browser.close();}
}
