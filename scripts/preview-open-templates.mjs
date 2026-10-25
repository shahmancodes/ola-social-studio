/** Review-only source previews. Does not import or register any Ola generation recipes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import {chromium} from 'playwright';

const root=path.resolve('.data/comparison/template-curation'), sources=path.join(root,'sources');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kebab=s=>s.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
const allowedTags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','clipPath','mask','linearGradient','radialGradient','stop']);
const attr=(k,v)=>/^(on|href|xlink|xmlns)/i.test(k)||typeof v==='object'||/url\((?!#)/.test(String(v))?'':` ${['viewBox','preserveAspectRatio','gradientUnits','gradientTransform','clipPathUnits'].includes(k)?k:kebab(k)}="${esc(v)}"`;
function raw(node){
 if(typeof node==='string')return esc(node);
 if(!node||!allowedTags.has(node.tag))return '';
 let attrs='';for(const[k,v]of Object.entries(node.attrs??{})){
  if(k==='style'&&v&&typeof v==='object')attrs+=` style="${esc(Object.entries(v).filter(([key,value])=>!/^on/i.test(key)&&!/(url\(|expression|javascript:)/i.test(String(value))).map(([key,value])=>`${kebab(key)}:${value}`).join(';'))}"`;
  else attrs+=attr(k,v);
 }
 return `<${node.tag}${attrs}>${(node.content??[]).map(raw).join('')}</${node.tag}>`;
}
function paint(s){
 const f=s.fills?.[0],st=s.strokes?.[0];
 return ` fill="${esc(f?.fillColor??'none')}" fill-opacity="${f?.fillOpacity??1}"${st?` stroke="${esc(st.strokeColor??'#000')}" stroke-width="${st.strokeWidth??1}" stroke-opacity="${st.strokeOpacity??1}"`:''}`;
}
function d(content){return(content??[]).map(c=>{
 const p=c.params??{};
 switch(c.command){case'move-to':return`M${p.x} ${p.y}`;case'line-to':return`L${p.x} ${p.y}`;case'curve-to':return`C${p.c1x} ${p.c1y} ${p.c2x} ${p.c2y} ${p.x} ${p.y}`;case'close-path':return'Z';default:throw new Error('Unsupported source path command: '+c.command);}
}).join(' ');}
const fontCss=(await Promise.all(['Regular','Bold','Black'].map(async(v,i)=>`@font-face{font-family:SourcePreview;src:url(data:font/ttf;base64,${(await fs.readFile(path.join(sources,`SourceSans3-${v}.ttf`))).toString('base64')});font-weight:${[400,700,900][i]}}`))).join('');
const archive=await fs.readFile(path.join(sources,'penpot-community-covers.penpot'));
const zip=await JSZip.loadAsync(archive),shapes=new Map();
for(const[n,file]of Object.entries(zip.files))if(n.includes('/pages/')&&n.split('/').length===5){const s=JSON.parse(await file.async('string'));shapes.set(s.id,s);}
function shape(s){
 if(s.hidden)return '';
 let body='';
 switch(s.type){
  case'group':body=(s.shapes??[]).map(id=>shape(shapes.get(id))).join('');break;
  case'frame':body=`<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"${paint(s)}/>`+(s.shapes??[]).map(id=>shape(shapes.get(id))).join('');break;
  case'path':body=`<path d="${d(s.content)}"${paint(s)}/>`;break;
  case'rect':body=`<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.r1??0}"${paint(s)}/>`;break;
  case'circle':body=`<ellipse cx="${s.x+s.width/2}" cy="${s.y+s.height/2}" rx="${s.width/2}" ry="${s.height/2}"${paint(s)}/>`;break;
  case'svg-raw':body=s.content?.tag==='svg'?raw({...s.content,attrs:{...s.content.attrs,x:s.x,y:s.y,width:s.width,height:s.height}}):raw(s.content);break;
  case'text':body=(s.positionData??[]).map(t=>`<text x="${t.x}" y="${t.y}" font-family="SourcePreview,Arial,sans-serif" font-size="${t.fontSize}" font-weight="${t.fontWeight}" fill="${esc(t.fills?.[0]?.fillColor??'#222')}" fill-opacity="${t.fills?.[0]?.fillOpacity??1}">${esc(t.text)}</text>`).join('');break;
  default:throw new Error('Unsupported source shape: '+s.type);
 }
 return `<g opacity="${s.opacity??1}">${body}</g>`;
}
await fs.mkdir(path.join(root,'previews'),{recursive:true});
await fs.mkdir(path.join(root,'renders'),{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:627},deviceScaleFactor:1});
 for(const[id,frameId]of [['penpot-abstract-cover','b67e0975-9540-809b-8004-fc65f3b42e46'],['penpot-event-card','b67e0975-9540-809b-8004-fc65f3d540ad']]){
  const s=shapes.get(frameId);if(!s)throw new Error('Source frame missing');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="${s.x} ${s.y} ${s.width} ${s.height}"><style>${fontCss}</style><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="white"/>${shape(s)}</svg>`;
  await fs.writeFile(path.join(root,'renders',id+'.svg'),svg);
  await page.setContent(`<html><style>body{margin:0}</style>${svg}</html>`);await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(root,'previews',id+'.png')});
 }
 // Literal HTML equivalents of the selected MIT Vue layout structures. Sample copy
 // and procedural artwork replace the upstream noncommercial images and assets.
 const art=(n=0)=>`<div class="art art${n}"><span>FIELD NOTES / ${String(n+1).padStart(2,'0')}</span><i></i><b></b><em></em></div>`;
 const slides={
  'apple-split-image':`<div class="split"><div class="layout auto"><h1>Small changes.<br>Clearer thinking.</h1><h2>A practical field guide</h2><p>Give one idea room to breathe.<br>Let the image carry the rest.</p></div><div class="split-art">${art(0)}</div></div>`,
  'apple-image-cover':`<div class="layout intro image-cover">${art(1)}<div class="byline">FIELD NOTES · ISSUE 01</div><div class="bottom"><h1>See things differently.</h1><p>A new perspective starts here.</p></div></div>`,
  'apple-triptych':`<div class="triptych"><div class="left-image">${art(0)}</div><div class="right-images"><div>${art(1)}</div><div>${art(2)}</div></div></div>`,
  'apple-quote':`<div class="layout centered"><div><h1>“Make something people<br>want to keep.”</h1><p class="attribution">Sample quotation · Editorial series</p></div></div>`,
  'apple-fact':`<div class="layout centered fact"><div><h1>24%</h1><p>One number. One clear takeaway.</p></div></div>`,
  'apple-bullets':`<div class="layout bullets"><div><ul><li>Start with one clear question.</li><li>Show the evidence behind it.</li><li>Give the reader a next step.</li></ul></div></div>`,
 };
 const css=`*{box-sizing:border-box}body{margin:0;width:980px;height:552px;background:#fff;color:#111;font:17.6px/1.5 Arial,sans-serif}.layout{padding:40px 56px;height:100%}h1{font-size:36px;line-height:1.25;margin:0 0 16px;font-weight:700;letter-spacing:-.05em}h2{font-size:24px;line-height:1.3;margin:0;font-weight:700}h1+h2{margin-top:-16px}p{margin:16px 0;line-height:24px}h1+p{margin-top:-8px;margin-bottom:16px}.auto{margin:auto 0;height:auto}.split{display:grid;grid-template-columns:1fr 1fr;width:100%;height:100%}.split-art{margin:56px 56px 56px 0}.art{position:relative;overflow:hidden;width:100%;height:100%;background:#c8ddd2;color:#1e433b}.art span{position:absolute;left:22px;top:20px;font-size:10px;letter-spacing:2px}.art i{position:absolute;display:block;left:10%;top:22%;width:80%;height:60%;background:#2a6551;border-radius:48% 48% 6% 6%;transform:rotate(-12deg)}.art b{position:absolute;left:28%;top:42%;width:78%;height:65%;background:#a9c3b6;border-radius:50%;transform:rotate(12deg)}.art em{position:absolute;left:7%;bottom:14%;width:28%;height:36%;border:2px solid #ecf3dc;border-radius:50%;transform:rotate(18deg)}.art1{background:#eadac5;color:#654127}.art1 i{background:#ae6547}.art1 b{background:#d9b38b}.art2{background:#cbd2ec;color:#343d6d}.art2 i{background:#6675ab}.art2 b{background:#a7b1d7}.image-cover{position:relative;padding:40px 56px}.image-cover>.art{position:absolute;inset:0;z-index:-1}.image-cover .art span{display:none}.image-cover{isolation:isolate;color:#fff}.image-cover:after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(transparent 15%,#27180dde)}.byline{position:absolute;top:40px;font-weight:700}.bottom{position:absolute;bottom:40px}.intro h1{font-size:60px;line-height:80px;letter-spacing:-.035em}.intro h1+p{font-size:24px;font-weight:700;margin-top:-16px}.triptych{display:grid;grid-template-columns:1fr 1fr;width:100%;height:100%;column-gap:28px}.left-image{margin:56px 0 56px 56px}.right-images{display:grid;grid-template-rows:1fr 1fr;row-gap:28px;height:100%;padding:56px 56px 56px 0}.right-images>div{min-height:0}.centered{display:grid;align-items:center}.attribution{margin-top:24px;margin-left:24px}.fact{text-align:center;place-content:center}.fact h1{font-size:96px;line-height:1;font-weight:700}.fact h1+p{font-size:24px;font-weight:700;margin-top:16px}.bullets>div{padding-top:72px}.bullets ul{padding-left:1.1em;margin:0 0 16px}.bullets li{padding-left:.2em;line-height:1.8em}`;
 await page.setViewportSize({width:980,height:552});
 for(const[id,body]of Object.entries(slides)){
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}</style><body>${body}</body></html>`;
  await fs.writeFile(path.join(root,'renders',id+'.html'),html);await page.setContent(html);
  await page.screenshot({path:path.join(root,'previews',id+'.png')});
 }
 // Perxel announcement.tsx: the source's portrait constants (88/240/300 px
 // margins, 96 px headline, 26 px footer, -46% vertical transform), translated
 // to static HTML. Sample logo/copy are ours, not extracted brand assets.
 const announcement=`<!doctype html><html lang="en"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif}.canvas{position:relative;width:1080px;height:1920px;overflow:hidden;color:#fff;background:radial-gradient(120% 90% at 85% 110%,#0a1022 0%,transparent 60%),#1f2a44}.logo{position:absolute;left:88px;right:88px;top:240px;height:44px;font-size:32px;line-height:44px;letter-spacing:4px;font-weight:600}.headline{position:absolute;left:88px;right:88px;top:50%;transform:translateY(-46%);font-size:96px;font-weight:300;line-height:1.06;letter-spacing:-2px}.headline b{font-weight:600}.footer{position:absolute;left:88px;right:88px;bottom:300px;height:40px;display:flex;align-items:center;justify-content:space-between;font-size:26px;letter-spacing:.3px}.footer:before{content:'';position:absolute;left:0;right:0;top:-48px;height:1px;background:#ffffff47}.footer span{opacity:.8}</style><body><div class="canvas"><div class="logo">FIELD NOTES</div><div class="headline">Something new<br>is <b>here.</b></div><div class="footer"><span>example.com</span></div></div></body></html>`;
 await fs.writeFile(path.join(root,'renders','perxel-announcement.html'),announcement);
 await page.setViewportSize({width:1080,height:1920});await page.setContent(announcement);
 await page.screenshot({path:path.join(root,'previews','perxel-announcement.png')});
}finally{await browser.close();}
console.log('Rendered source Penpot boards, code-only Slidev layouts and a Perxel portrait preview. No generation recipes registered.');
await fs.writeFile(path.join(root,'source-archive-sha256.txt'),crypto.createHash('sha256').update(archive).digest('hex')+'\n');
