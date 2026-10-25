import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { ContentBrand } from './content-brand';
import type { VisualPage, VisualScene, SceneElement } from './content-layout';
import { readableInk } from './brand-design';

/** Content-led social compositions: every shape either groups content or shows sequence. */
export async function buildSocialScene(format: 'story'|'carousel', page: VisualPage, brand: ContentBrand, index: number, total: number, component?: Buffer): Promise<VisualScene> {
  const story=format==='story', W=1080,H=story?1920:1350,p=brand.palette, rules=brand.designSystem!;
  for(const name of [rules.headingFontName,rules.bodyFontName])if(name&&!brand.fonts?.some(f=>f.name===name))throw new Error(`Requested font is unavailable in this company snapshot: ${name}`);
  const layout=page.layout??(story?'hero':index===0?'hero':index===total-1?'closing':'steps');
  const dark=layout==='closing'||layout==='statement'||(rules.family==='poster'&&layout==='hero');
  const background=page.visualOverrides?.background??(dark?p.dark:p.background);
  const ink=readableInk(background,dark?'#FFFFFF':p.ink), accent=readableInk(background,p.accent);
  const el:SceneElement[]=[];const pad=rules.spacing==='compact'?64:rules.spacing==='generous'?100:80;
  const top=story?292:68, bottom=story?1496:1230, usable=W-pad*2;
  const text=(id:string,value:string,x:number,y:number,w:number,h:number,size:number,heading=false,color=ink)=>{if(value.trim())el.push({kind:'text',id,x,y,w,h,text:value,size,weight:heading?'bold':'regular',color,lines:[],fontFamily:heading?'OlaHeading':'OlaBody'});};
  const rect=(x:number,y:number,w:number,h:number,fill:string,radius=0)=>el.push({kind:'rect',x,y,w,h,fill,radius});
  const line=(x:number,y:number,w:number,color:string)=>el.push({kind:'line',x,y,x2:x+w,y2:y,color,width:2});
  if(brand.logo&&(index===0||rules.logoPlacement!=='cover-only')){
    const bytes=await sharp(await fs.readFile(brand.logo.diskPath)).resize({width:650,height:200,fit:'inside'}).png().toBuffer();
    // The supplied mark stays intact. Dark layouts reserve a light brand surface unless explicitly disabled.
    if(dark&&rules.logoTreatment==='light-surface')rect(pad-16,top-14,246,112,'#FFFFFF',8);
    el.push({kind:'image',id:'logo',x:pad,y:top,w:214,h:80,bytes});
  }else if(!brand.logo)text('brand',brand.name,pad,top,story?usable:usable-220,60,30,true);
  if(!story)text('progress',`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,W-pad-160,top+14,160,50,26);
  const start=top+(story?185:174);const titleH=story?400:300;
  const family=rules.family;const bodySize=Math.round(40*rules.bodyScale);
  // A poster concentrates the message; an editorial composition groups title and explanation;
  // a grid makes sequence and the reading order visible. None invent extra copy.
  if(page.visualContent){
    text('title',page.title,pad,start,usable,230,90,true);
    if(page.body)text('body',page.body,pad,start+250,usable,110,bodySize-4);
    const visual=page.visualContent, items=visual.items;
    const y=start+(page.body?400:300), available=Math.min(story?470:500,bottom-y-45);
    if(visual.kind==='comparison'&&items.length!==2)throw new Error('A comparison must have exactly two sides.');
    if(visual.kind==='comparison'){
      const w=(usable-36)/2;
      items.forEach((item,i)=>{const x=pad+i*(w+36);rect(x,y,w,available,dark?'#292929':p.alternate,12);const ci=readableInk(dark?'#292929':p.alternate,p.ink);text(`item-${i}-label`,item.label,x+24,y+24,w-48,120,42,true,ci);text(`item-${i}-detail`,item.detail,x+24,y+160,w-48,available-184,32,false,ci);});
    }else if(visual.kind==='process'){
      const gap=24,w=(usable-gap*(items.length-1))/items.length,fill=dark?'#292929':p.alternate,ci=readableInk(fill,p.ink);
      items.forEach((item,i)=>{const x=pad+i*(w+gap);rect(x,y,w,available,fill,12);
        text(`item-${i}-step`,String(i+1).padStart(2,'0'),x+20,y+20,w-40,48,32,true,ci);
        text(`item-${i}-label`,item.label,x+20,y+95,w-40,90,38,true,ci);
        text(`item-${i}-detail`,item.detail,x+20,y+205,w-40,available-225,30,false,ci);
      });
    }else if(visual.kind==='example'){
      if(items.length>2)throw new Error('An example panel supports at most two message blocks.');
      const rowH=available/items.length,fill=dark?'#292929':p.alternate,ci=readableInk(fill,p.ink);
      items.forEach((item,i)=>{const x=pad+(i%2?44:0),yy=y+i*rowH,w=usable-44;
        rect(x,yy,w,rowH-16,fill,18);
        text(`item-${i}-label`,item.label,x+24,yy+20,w-48,76,32,true,ci);
        text(`item-${i}-detail`,item.detail,x+24,yy+105,w-48,rowH-141,30,false,ci);
      });
    }else{
      const rowH=available/items.length;
      items.forEach((item,i)=>{const yy=y+i*rowH;const offset=visual.kind==='example'?0:78;
        if(offset)text(`item-${i}-step`,visual.kind==='checklist'?'✓':String(i+1).padStart(2,'0'),pad,yy,60,55,34,true,accent);
        text(`item-${i}-label`,item.label,pad+offset,yy,usable-offset,44,34,true);
        text(`item-${i}-detail`,item.detail,pad+offset,yy+50,usable-offset,rowH-60,30);
        if(i<items.length-1)line(pad+offset,yy+rowH-8,usable-offset,accent);
      });
    }
  }else if(story&&(page.assetId||component)&&page.storyTreatment==='image-showcase') {
    text('title',page.title,pad,start,usable,230,88,true);
    const asset=brand.assets.find(a=>a.id===page.assetId);
    const bytes=component??(asset?await sharp(await fs.readFile(asset.diskPath)).png().toBuffer():undefined);
    if(!bytes)throw new Error('Image showcase requires an available selected asset.');
    el.push({kind:'image',id:'artwork',x:pad,y:start+255,w:usable,h:450,bytes});
    text('body',page.body,pad,start+730,usable,130,38);
  }else if(family==='poster'&&(layout==='hero'||layout==='statement')){
    text('title',page.title,pad,start,usable,story?460:380,story?116:108,true);
    line(pad,start+(story?500:410),usable,accent);
    text('body',page.body,pad,start+(story?548:454),usable,story?250:250,bodySize);
  }else if(layout==='split'&& (page.assetId||component)){
    text('title',page.title,pad,start,usable,260,92,true);
    text('body',page.body,pad,start+330,usable*.48,story?360:320,bodySize);
    const asset=brand.assets.find(a=>a.id===page.assetId);const bytes=component??(asset?await sharp(await fs.readFile(asset.diskPath)).png().toBuffer():undefined);
    if(bytes)el.push({kind:'image',id:'artwork',x:W*.55,y:start+330,w:W*.37,h:story?370:320,bytes});
  }else if(layout==='split'){
    const left=usable*.45,rightX=pad+usable*.55;
    text('title',page.title,pad,start,left,story?590:560,84,true);
    el.push({kind:'line',x:pad+usable*.5,y:start,x2:pad+usable*.5,y2:start+(story?610:580),color:accent,width:2});
    text('body',page.body,rightX,start+80,usable*.45,story?510:480,bodySize);
  }else if(layout==='steps'&&page.body.split(/\n+/).filter(Boolean).length===1){
    text('title',page.title,pad,start,usable,titleH,92,true);
    const y=start+titleH+55,fill=dark?'#292929':p.alternate;
    rect(pad,y,usable,story?270:300,fill,12);
    text('body',page.body,pad+36,y+34,usable-72,story?202:232,bodySize,false,readableInk(fill,p.ink));
  }else if(layout==='steps'||layout==='diagram'){
    text('title',page.title,pad,start,usable,titleH,92,true);
    const parts=page.body.split(/\n+/).map(v=>v.trim()).filter(Boolean);
    if(parts.length>5)throw new Error('A social checklist can contain at most five items per page.');
    const y=start+titleH+65;const cellH=Math.min(150,(bottom-y-75)/Math.max(1,parts.length));
    parts.forEach((part,i)=>{
      const yy=y+i*cellH;
      if(parts.length>1){text(`step-${i}`,String(i+1).padStart(2,'0'),pad,yy,65,55,32,true,accent);}
      text(i===0?'body':`body-${i}`,part,pad+(parts.length>1?90:0),yy,usable-(parts.length>1?90:0),cellH-20,bodySize);
      if(i<parts.length-1)line(pad,yy+cellH-8,usable,accent);
    });
  }else{
    text('title',page.title,pad,start,usable,titleH,story?110:102,true);
    const y=start+titleH+(family==='grid'?80:50);
    if(family==='grid')line(pad,y-30,usable,accent);
    text('body',page.body,pad,y,usable,story?260:260,bodySize);
  }
  if(page.credit)text('credit',page.credit,pad,story?bottom-145:bottom-15,usable,36,24);
  if(story&&page.cta?.trim()){
    const fill=p.accent;rect(pad,bottom-104,usable,104,fill,family==='grid'?0:12);el[el.length-1].id='cta-frame';
    text('cta',page.cta.trim(),pad+32,bottom-91,usable-64,74,34,true,readableInk(fill,'#FFFFFF'));
  }
  if(!story){
    const unit=(usable-(total-1)*8)/total;
    for(let i=0;i<total;i++)rect(pad+i*(unit+8),bottom+40,unit,5,i<=index?accent:(dark?'#555555':'#D8DCE1'));
  }
  // An explicit artwork choice is honored in every composition, not silently dropped.
  if(page.visualContent&&(page.assetId||component))throw new Error("Choose either a structured content component or an image-led layout per page.");
  const selected=brand.assets.find(a=>a.id===page.assetId);
  if((selected||component)&&!el.some(e=>e.kind==='image'&&e.id==='artwork')){
    const bytes=component??await sharp(await fs.readFile(selected!.diskPath)).png().toBuffer();
    const title=el.find(e=>e.kind==='text'&&e.id==='title');const body=el.find(e=>e.kind==='text'&&e.id==='body');
    if(title?.kind==='text'){title.h=250;title.size=Math.min(title.size,86);}
    if(body?.kind==='text'){body.y=start+290;body.w=usable*.48;body.h=340;}
    el.push({kind:'image',id:'artwork',x:W*.55,y:start+290,w:W*.37,h:340,bytes});
  }
  for(const e of el){const key=e.id==='title'?'title':e.id==='body'?'body':e.id==='cta'?'cta':e.id==='artwork'?'artwork':undefined;const o=key?page.visualOverrides?.[key]:undefined;if(!o)continue;
    const before={x:e.x,y:e.y,w:'w'in e?e.w:0,h:'h'in e?e.h:0};
    if(o.x!==undefined)e.x=o.x*W;if(o.y!==undefined)e.y=o.y*H;
    if('w'in e){if(o.width!==undefined)e.w=o.width*W;if(o.height!==undefined)e.h=o.height*H;}
    if(e.kind==='text'){if(o.fontSize!==undefined)e.size=o.fontSize;if(o.color)e.color=o.color;}
    if(e.id==='cta'&&'w'in e){const frame=el.find(v=>v.id==='cta-frame');if(frame?.kind==='rect'){frame.x+=e.x-before.x;frame.y+=e.y-before.y;frame.w+=e.w-before.w;frame.h+=e.h-before.h;}}
  }
  return {width:W,height:H,background,elements:el,measured:true,fonts:brand.fonts,headingFontId:rules.headingFontId??brand.fonts?.find(f=>f.name===rules.headingFontName)?.id,bodyFontId:rules.bodyFontId??brand.fonts?.find(f=>f.name===rules.bodyFontName)?.id};
}
