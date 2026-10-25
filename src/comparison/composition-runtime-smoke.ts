import { buildVisualScene, scenePng } from '../lib/content-layout';
import { composePage } from '../lib/composition';
import sharp from 'sharp';
import type { ContentBrand } from '../lib/content-brand';

// Exercise the real tsx worker transform: Vitest and the Next bundler transform callbacks differently.
const brand:ContentBrand={companyId:'runtime-fixture',name:'Runtime fixture',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',accent:'#164DB8',ink:'#161616',dark:'#161616'},assets:[]};
const page=composePage({title:'Explain the reason',body:'State the problem this change addresses.'},{family:'asymmetric-editorial',responsive:{version:1},intent:{goal:'Explain the change',relationship:'statement',reason:'Keep the explanation readable'}});
const scene=await buildVisualScene('carousel',page,brand);
const bytes=await scenePng(scene),meta=await sharp(bytes).metadata();
const title=scene.elements.find(e=>e.id==='title');
if(title?.kind!=='text'||title.lines.includes('the'))throw new Error('Headline balancing failed in the worker runtime.');
console.log(JSON.stringify({width:meta.width,height:meta.height,lines:title.lines}));
