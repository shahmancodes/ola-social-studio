// Local synthetic capability proof. No model, external service, saved project or provider usage.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import sharp from 'sharp';import {chromium} from 'playwright';import {build} from 'esbuild';
import {SemanticDesignSpecSchema,COMPONENT_FORMATS,componentSources,componentText} from '../src/lib/semantic-design.ts';
import {SemanticComponentSchema} from '../src/lib/schemas.ts';import {composePage} from '../src/lib/composition.ts';
import {buildVisualScene,scenePng,sceneSvg} from '../src/lib/content-layout.ts';import {semanticDesignBlock} from '../src/lib/semantic-design-render.ts';
import {sceneFontCss,sceneIssues} from '../src/lib/scene-renderer.ts';
const root=process.cwd(),directory=path.join(root,'.data/comparison/primitive-proofs',crypto.randomUUID());await fs.mkdir(directory,{recursive:true});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=['src/lib/design-primitives.ts','src/lib/freeform-canvas.ts','src/lib/freeform-scene.ts','src/lib/content-layout.ts','src/lib/scene-renderer.ts','src/lib/semantic-design.ts','src/lib/semantic-design-layout.ts','src/lib/semantic-design-fit.ts','src/lib/semantic-design-render.ts','src/lib/responsive-scene.ts','src/lib/modern-content.ts','src/components/freeform-page-canvas.tsx','src/components/canvas-insert.tsx'];
const fingerprints=await Promise.all(files.map(async file=>({file,sha256:hash(await fs.readFile(file))})));
const sample=JSON.parse(await fs.readFile('examples/design-primitives.json','utf8'));
const source={title:sample.title,body:'',semanticComponent:SemanticComponentSchema.parse(sample.semanticComponent),semanticDesign:{candidateId:'a1000000-0000-4000-8000-000000000000',spec:SemanticDesignSpecSchema.parse(sample.spec)}};
const sourceJson=JSON.stringify(source),brand={companyId:'fixture',name:'Sample',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#F7F6F2',alternate:'#E9EEF5',accent:'#174A80',ink:'#152A40',dark:'#152A40'}},rows=[];
for(const format of COMPONENT_FORMATS){
 const page=composePage(source,{family:'diagram-led',intent:{goal:sample.spec.purpose,relationship:'sequence',reason:'Keep each action and its explanation grouped.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',focal:'artwork',visualWeight:.6}});
 const scene=format==='article'?semanticDesignBlock(source,brand):await buildVisualScene(format,page,brand),file=path.join(directory,format+'.png');
 await fs.writeFile(file,await scenePng(scene));await fs.writeFile(path.join(directory,format+'.svg'),sceneSvg(scene).replace('><rect',`><style>${await sceneFontCss(scene)}</style><rect`));
 assert.deepEqual(sceneIssues(scene),[]);
 for(const key of componentSources(source.semanticComponent))assert.equal(scene.elements.filter(e=>e.kind==='text'&&e.copySource===key&&e.text===componentText(source.semanticComponent,key)).length,1);
 rows.push({format,file,width:scene.width,height:scene.height,nativeShapes:scene.elements.filter(e=>e.id?.startsWith('designed-shape-')).length,nativeConnectorParts:scene.elements.filter(e=>e.id?.startsWith('designed-edge-')).length,status:'passed'});
}
assert.equal(JSON.stringify(source),sourceJson);await fs.writeFile(path.join(directory,'source.json'),JSON.stringify(source,null,2));
// Exercise the real client component without a server, credentials, or project writes.
const fixture=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{FreeformPageCanvas}from './src/components/freeform-page-canvas';
const initial=[{id:'a',kind:'rect',x:70,y:90,width:190,height:110,rotation:0,fill:'#174A80',radius:18},{id:'b',kind:'rect',x:490,y:350,width:190,height:110,rotation:0,fill:'#174A80',radius:18}];
function Fixture(){const[objects,setObjects]=useState(window.savedObjects??initial);window.savedObjects=objects;return <FreeformPageCanvas projectId="fixture" companyId="fixture" assets={[]} fonts={[]} disabled={false} commentMode={false} busy={false} preview={{width:800,height:600,background:'#F7F6F2',color:'#F7F6F2',fontCss:'',balanced:false,texts:[],objects:initial,palette:${JSON.stringify(brand.palette)}}} page={{title:'',body:'',editorAppearance:{freeform:{version:1,objects}}}} onObjects={next=>{window.savedObjects=next;setObjects(next)}} onPageChange={()=>{}} onLayout={()=>{}} onSelect={()=>{}}/>}
const root=createRoot(document.getElementById('root'));let version=0;window.remount=()=>root.render(<Fixture key={++version}/>);window.remount();`;
await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'primitive-fixture.tsx',loader:'tsx'},outfile:path.join(directory,'ui.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':path.join(root,'src')},logLevel:'silent'});
const browser=await chromium.launch({headless:true});const ui={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>console.error('Editor error:',error.message));
 const html=`<style>*{box-sizing:border-box}body{margin:32px;font-family:Arial,sans-serif;--card:#fff;--border:#e6e3eb;--foreground:#29252f;--muted:#f5f3f7;--accent:#f0edf7}input,button,select{font:inherit}</style><style>${await fs.readFile(path.join(directory,'ui.css'),'utf8')}</style><div id="root"></div>`;
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto('http://localhost/primitive-proof');
 await page.evaluate(()=>{window.fetch=async()=>Response.json({images:[]});});await page.addScriptTag({content:await fs.readFile(path.join(directory,'ui.js'),'utf8')});
 await page.locator('[data-object-id="a"]').click();await page.locator('[data-object-id="b"]').click({modifiers:['Shift']});await page.getByRole('button',{name:'Connect objects',exact:true}).click();
 const connection=await page.evaluate(()=>window.savedObjects.find(o=>o.connector));assert(connection);assert.equal(connection.arrow,'end');assert.equal(connection.route,'elbow');ui.connected=true;
 await page.locator('[data-object-id="a"]').click();await page.getByRole('spinbutton',{name:'X',exact:true}).fill('150');await page.getByRole('spinbutton',{name:'X',exact:true}).press('Tab');
 const moved=await page.evaluate(()=>window.savedObjects.find(o=>o.connector));assert.notEqual(moved.x,connection.x);assert.deepEqual(moved.connector,connection.connector);ui.followsTargetMovement=true;
 await page.getByRole('button',{name:'Shapes',exact:true}).click();await page.getByRole('tab',{name:'Shapes',exact:true}).focus();await page.keyboard.press('ArrowRight');await page.getByRole('tab',{name:'Brand assets',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Brand assets',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowLeft');
 await page.getByRole('textbox',{name:'Search insert library'}).fill('arrow');await page.getByRole('button',{name:'Arrow Show direction',exact:true}).click();
 const arrow=await page.evaluate(()=>window.savedObjects.at(-1));assert.equal(arrow.kind,'line');assert.equal(arrow.arrow,'end');assert.equal(arrow.lineAxis,'horizontal');ui.importedArrow=true;
 await page.getByRole('combobox',{name:'Arrowheads',exact:true}).selectOption('both');await page.getByRole('combobox',{name:'Line path',exact:true}).selectOption('elbow');
 await page.evaluate(()=>window.remount());await page.locator(`[data-object-id="${arrow.id}"]`).click();assert.equal(await page.getByRole('combobox',{name:'Arrowheads',exact:true}).inputValue(),'both');assert.equal(await page.getByRole('combobox',{name:'Line path',exact:true}).inputValue(),'elbow');ui.survivesReload=true;
 await page.getByRole('button',{name:'Shapes',exact:true}).click();await page.screenshot({path:path.join(directory,'editor.png')});
}finally{await browser.close();}
const tiles=[];for(const[rowIndex,row]of rows.entries())tiles.push({input:await sharp(row.file).resize({width:300,height:535,fit:'inside'}).png().toBuffer(),left:20+(rowIndex%3)*330,top:42+Math.floor(rowIndex/3)*585});
const labels=Buffer.from(`<svg width="1010" height="1180"><style>text{font:15px sans-serif;fill:#152A40}</style>${rows.map((r,i)=>`<text x="${20+i%3*330}" y="${28+Math.floor(i/3)*585}">${r.format}</text>`).join('')}</svg>`);
await sharp({create:{width:1010,height:1180,channels:3,background:'#DDDDE2'}}).composite([...tiles,{input:labels,left:0,top:0}]).png().toFile(path.join(directory,'contact-sheet.png'));
for(const f of fingerprints)assert.equal(hash(await fs.readFile(f.file)),f.sha256,'Source changed during proof: '+f.file);
const report={createdAt:new Date().toISOString(),method:'Synthetic local cross-format and real editor interaction proof. Same canonical source, native text, shapes and automatically routed semantic arrows. No new provider calls, saved project changes, independent visual judgment or professional-quality claim.',providerCalls:0,rows,ui,sourceHash:hash(sourceJson),fingerprints};
await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({directory,formatsPassed:rows.length,ui}));
