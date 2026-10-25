import {describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fontFaceMetadata} from './font-face-metadata';
import {fontFaceDescriptorCss} from './font-catalog';
import {companyFontChoices,selectedFontCss} from './editor-font-files';
import {EditorFonts} from '../components/editor-fonts';
import {sceneFontCss,sceneIssues} from './scene-renderer';
import {buildVisualScene,scenePng} from './content-layout';
import {composePage} from './composition';
import type {ContentBrand} from './content-brand';

const file=(name:string)=>path.join(process.cwd(),'node_modules',name);
const regular=file('@fontsource/lato/files/lato-latin-400-normal.woff2'),bold=file('@fontsource/lato/files/lato-latin-700-normal.woff2'),italic=file('@fontsource/lato/files/lato-latin-400-italic.woff2'),variable=file('@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2');
const asset=(id:string,diskPath:string)=>({id,name:'A name that does not specify weight',diskPath,mediaType:'font/woff2',role:'font'});
const brand:ContentBrand={companyId:'fixture',name:'',audience:'Readers',voice:'Clear',description:'',typography:'Lato',imagery:'',formatRules:'',examples:[],assets:[],fonts:[asset('regular',regular),asset('bold',bold)],designSystem:{headingFontId:'bold',bodyFontId:'regular',bodyScale:1.1,spacing:'balanced',logoTreatment:'original',notes:[]},palette:{background:'#FFFFFF',alternate:'#EEEFF2',accent:'#164DB8',ink:'#111111',dark:'#111111'}};
describe('real font-face weight metadata',()=>{
 it('uses actual static weight and slant rather than filenames or a fabricated variable range',async()=>{
  expect(fontFaceMetadata(await fs.readFile(regular))).toEqual({weight:'400',style:'normal'});
  expect(fontFaceMetadata(await fs.readFile(bold))).toEqual({weight:'700',style:'normal'});
  expect(fontFaceMetadata(await fs.readFile(italic))).toEqual({weight:'400',style:'italic'});
  expect(fontFaceMetadata(await fs.readFile(variable))).toEqual({weight:'200 800',style:'normal'});
 });
 it('provides identical descriptors to the editor, custom-font exports and measured scenes',async()=>{
  const fonts=[asset('regular',regular)],choices=await companyFontChoices(fonts),descriptor=fontFaceDescriptorCss(choices[0].face);
  expect(descriptor).toBe('font-weight:400;font-style:normal;');
  expect(renderToStaticMarkup(createElement(EditorFonts,{companyId:'fixture',fonts:choices}))).toContain(descriptor);
  expect(await selectedFontCss([{fontId:'regular'}],fonts)).toContain(descriptor);
  const css=await sceneFontCss({width:1,height:1,background:'#FFFFFF',elements:[],fonts,bodyFontId:'regular',headingFontId:'regular'});
  expect(css).not.toContain('font-weight:100 900');expect(css.match(/font-weight:400/g)).toHaveLength(2);
 });
 it.each(['poster','carousel'] as const)('renders a visibly heavier emphasized phrase from a static regular face in %s',async format=>{
  const title='Read the visible words',body='Visible: a request to talk later.';
  const plan={family:'oversized-typography',bodyMode:'text',intent:{goal:'Separate the observation from an inference',relationship:'statement',reason:'A visibly emphasized label distinguishes the existing observation.'},responsive:{version:1,arrangement:'stack'},typography:{body:{leading:1.3,size:1}}};
  const normal=composePage({title,body},plan),emphasized=composePage({title,body},{...plan,typography:{body:{...plan.typography.body,emphasis:[{start:0,end:1,treatment:'bold'}]}}});
  const a=await buildVisualScene(format,normal,brand),b=await buildVisualScene(format,emphasized,brand),before=await scenePng(a),after=await scenePng(b);
  expect(sceneIssues(a)).toEqual([]);expect(sceneIssues(b)).toEqual([]);expect(before.equals(after)).toBe(false);
  const region=a.elements.find(e=>e.id==='body');if(!region||region.kind!=='text')throw Error('Missing body');
  const area={left:Math.floor(region.x),top:Math.floor(region.y),width:Math.floor(region.w),height:Math.ceil(region.h)};
  const ink=async(png:Buffer)=>{const pixels=await sharp(png).extract(area).removeAlpha().raw().toBuffer();return pixels.reduce((n,value)=>n+255-value,0);};
  expect(await ink(after)).toBeGreaterThan(await ink(before));
  expect(normal.body).toBe(emphasized.body);expect(normal.composition?.blocks).toEqual(emphasized.composition?.blocks);
 },20000);
 it('preserves ordinary variable-font pixels while declaring the real supported range',async()=>{
  const page=composePage({title:'Make one useful thing',body:'Give the reader a clear first step.'},{family:'oversized-typography',intent:{goal:'A clear message',relationship:'statement',reason:'Use the existing variable face at regular and bold weights.'},responsive:{version:1}});
  const variableBrand={...brand,fonts:[asset('regular',variable),asset('bold',variable)]};
  const current=await buildVisualScene('poster',page,variableBrand),legacy=await buildVisualScene('poster',page,variableBrand);
  legacy.additionalFontCss=(await sceneFontCss(legacy)).replaceAll('font-weight:200 800','font-weight:100 900');
  expect((await scenePng(current)).equals(await scenePng(legacy))).toBe(true);
 },20000);
 it('rejects invalid font data and untrusted descriptor values',()=>{
  expect(()=>fontFaceMetadata(Buffer.from('not a font'))).toThrow();
  expect(()=>fontFaceDescriptorCss({weight:'400;display:none',style:'normal'})).toThrow();
  expect(()=>fontFaceDescriptorCss({weight:'0',style:'normal'})).toThrow();
 });
});
