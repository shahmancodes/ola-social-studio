/** Compare visible glyph text rather than SVG descriptions, alt text or source JSON. */
export function renderedCopyKey(value:string){return value.normalize('NFC').replace(/\*\*/g,'').replace(/\s+/g,'');}
export function missingRenderedCopy(required:Array<{source:string;text:string}>,visible:string[]){
 const rendered=visible.map(renderedCopyKey).filter(Boolean);
 return required.filter(item=>{const key=renderedCopyKey(item.text);return key&&!rendered.some(value=>value.includes(key));}).map(item=>item.source);
}
