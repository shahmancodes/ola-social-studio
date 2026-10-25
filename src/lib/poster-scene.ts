import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { VisualPage, VisualScene, SceneElement } from './content-layout';
import type { ContentBrand } from './content-brand';
import { readableInk } from './brand-design';

/** A4 digital proof, with editable text and no social interface or pagination. */
export async function buildPosterScene(page: VisualPage, brand: ContentBrand, component?: Buffer): Promise<VisualScene> {
  const width=1240,height=1754,pad=96,p=brand.palette,rules=brand.designSystem;
  const dark=page.layout==='statement'||page.layout==='closing';
  const background=page.visualOverrides?.background??(dark?p.dark:p.background);
  const ink=readableInk(background,dark?'#FFFFFF':p.ink),accent=readableInk(background,p.accent);
  const elements:SceneElement[]=[];
  const text=(id:string,value:string,x:number,y:number,w:number,h:number,size:number,heading=false,color=ink)=>{
    if(value.trim())elements.push({kind:'text',id,text:value,x,y,w,h,size,weight:heading?'bold':'regular',color,lines:[],fontFamily:heading?'OlaHeading':'OlaBody'});
  };
  if(brand.logo){
    if(dark&&rules?.logoTreatment!=='original')elements.push({kind:'rect',x:pad-16,y:pad-16,w:292,h:132,fill:'#FFFFFF',radius:6});
    elements.push({kind:'image',id:'logo',x:pad,y:pad,w:260,h:100,bytes:await sharp(await fs.readFile(brand.logo.diskPath)).png().toBuffer()});
  } else text('brand',brand.name,pad,pad,width-pad*2,70,36,true);
  const visual=component??(page.assetId?await (async()=>{const asset=brand.assets.find(a=>a.id===page.assetId);if(!asset)throw new Error('Poster artwork is outside this company snapshot.');return sharp(await fs.readFile(asset.diskPath)).png().toBuffer();})():undefined);
  if(page.visualContent&&visual)throw new Error('Choose one structured visual or artwork per poster.');
  if(page.eyebrow)text('eyebrow',page.eyebrow,pad,246,width-pad*2,64,28,true,accent);
  const top=page.eyebrow?340:280;
  text('title',page.title,pad,top,width-pad*2,visual||page.visualContent?310:540,visual?108:138,true);
  if(visual){
    text('body',page.body,pad,top+350,width-pad*2,185,40);
    elements.push({kind:'image',id:'artwork',x:pad,y:top+570,w:width-pad*2,h:490,bytes:visual});
  }else if(page.visualContent){
    text('body',page.body,pad,top+340,width-pad*2,150,40);
    const items=page.visualContent.items, rowH=Math.min(150,560/items.length), y=top+530;
    items.forEach((item,i)=>{text(`item-${i}-label`,item.label,pad,y+i*rowH,360,rowH-20,34,true,accent);text(`item-${i}-detail`,item.detail,pad+400,y+i*rowH,width-pad*2-400,rowH-20,32);});
  }else{
    elements.push({kind:'line',x:pad,y:top+595,x2:width-pad,y2:top+595,width:3,color:accent});
    text('body',page.body,pad,top+650,width-pad*2,420,48);
  }
  if(page.credit)text('credit',page.credit,pad,height-260,width-pad*2,42,22);
  if(page.cta)text('cta',page.cta,pad,height-174,width-pad*2,78,38,true,accent);
  for(const e of elements){const key=e.id as 'title'|'body'|'cta'|'artwork'|'eyebrow';const o=page.visualOverrides?.[key];if(!o)continue;
    if(o.x!==undefined)e.x=o.x*width;if(o.y!==undefined)e.y=o.y*height;
    if('w' in e){if(o.width!==undefined)e.w=o.width*width;if(o.height!==undefined)e.h=o.height*height;}
    if(e.kind==='text'){if(o.fontSize!==undefined)e.size=o.fontSize;if(o.color)e.color=o.color;}
  }
  for(const name of [rules?.headingFontName,rules?.bodyFontName])if(name&&!brand.fonts?.some(f=>f.name===name))throw new Error(`Requested font is unavailable in this company snapshot: ${name}`);
  return {width,height,background,elements,measured:true,fonts:brand.fonts,headingFontId:rules?.headingFontId??brand.fonts?.find(f=>f.name===rules?.headingFontName)?.id,bodyFontId:rules?.bodyFontId??brand.fonts?.find(f=>f.name===rules?.bodyFontName)?.id};
}
