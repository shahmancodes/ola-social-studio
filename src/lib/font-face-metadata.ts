import {create} from 'fontkit';
import {createHash} from 'node:crypto';
import type {FontFaceMetadata} from './font-catalog';

const cache=new Map<string,Readonly<FontFaceMetadata>>();
/** Inspect actual bytes: declaring a static face as a variable range suppresses synthetic bold in Chromium. */
export function fontFaceMetadata(bytes:Buffer):Readonly<FontFaceMetadata>{
 if(bytes.length>15*1024*1024)throw Error('Font file is too large.');
 const key=createHash('sha256').update(bytes).digest('hex'),saved=cache.get(key);if(saved)return saved;
 const font=create(bytes);
 if('fonts'in font)throw Error('Choose an individual font face instead of a font collection.');
 const axis=font.variationAxes.wght,weight=font['OS/2']?.usWeightClass??400;
 const values=axis?[axis.min,axis.max]:[weight];
 if(values.some(n=>!Number.isFinite(n)||n<1||n>1000)||axis&&axis.min>axis.max)throw Error('Font has an invalid weight range.');
 const result=Object.freeze({weight:values.join(' '),style:font['OS/2']?.fsSelection.italic||font.italicAngle!==0?'italic' as const:'normal' as const});
 if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(key,result);return result;
}
