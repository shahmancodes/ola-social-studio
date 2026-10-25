import { z } from 'zod';
import { TextboxStyleSchema, TextboxColorSchema, textboxGuide } from './textbox-style';

/** Word ranges address canonical copy; styling never stores a second copy value. */
export const TextTypographySchema = z.object({
  box: TextboxStyleSchema.optional(),
  color: TextboxColorSchema.optional(),
  bold: z.boolean().optional(), italic: z.boolean().optional(), underline: z.boolean().optional(),
  leading: z.number().min(.95).max(1.65).optional(),
  tracking: z.number().min(-.06).max(.16).optional(),
  size: z.number().min(.4).max(2).optional(),
  width: z.number().min(.45).max(1).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  wrap: z.enum(['balance', 'pretty', 'wrap']).optional(),
  maxLines: z.number().int().min(1).max(12).nullable().optional(),
  breakAfter: z.array(z.number().int().min(1).max(100)).max(8).optional(),
  emphasis: z.array(z.object({ start: z.number().int().min(0).max(99), end: z.number().int().min(1).max(100), treatment: z.enum(['accent', 'bold', 'italic']) }).strict()).max(4).optional(),
}).strict();
export const DesignTypographySchema = z.object({
  title: TextTypographySchema.optional(), body: TextTypographySchema.optional(),
  cta: TextTypographySchema.optional(), eyebrow: TextTypographySchema.optional(),
  credit: TextTypographySchema.optional(), label: TextTypographySchema.optional(), detail: TextTypographySchema.optional(),
}).strict();
export type TextTypography = z.infer<typeof TextTypographySchema>;
export type DesignTypography = z.infer<typeof DesignTypographySchema>;
const PhraseReferenceSchema=z.object({phrase:z.string().trim().min(1).max(300),occurrence:z.number().int().min(1).max(100).optional()}).strict();
const PhraseEmphasisSchema=PhraseReferenceSchema.extend({treatment:z.enum(['accent','bold','italic'])}).strict();
/** Phrase selectors exist only at the repair boundary; saved typography retains canonical word ranges. */
export const TextTypographyPatchSchema=TextTypographySchema.extend({
  emphasis:z.array(z.union([TextTypographySchema.shape.emphasis.unwrap().element,PhraseEmphasisSchema])).max(4).optional(),
  breakAfterText:z.array(PhraseReferenceSchema).max(8).optional(),
}).strict();
export const DesignTypographyPatchSchema=DesignTypographySchema.extend({
  title:TextTypographyPatchSchema.optional(),body:TextTypographyPatchSchema.optional(),cta:TextTypographyPatchSchema.optional(),eyebrow:TextTypographyPatchSchema.optional(),credit:TextTypographyPatchSchema.optional(),
}).strict();

function phraseRange(text:string,reference:z.infer<typeof PhraseReferenceSchema>){
  const words=text.match(/\S+/g)??[],phrase=reference.phrase.match(/\S+/g)??[];
  const starts=words.flatMap((_,i)=>phrase.every((word,j)=>words[i+j]===word)?[i]:[]);
  if(!starts.length)throw Error(`Typography phrase ${JSON.stringify(reference.phrase)} must match exact complete words, including punctuation, in its source field.`);
  if(reference.occurrence===undefined&&starts.length!==1)throw Error(`Typography phrase ${JSON.stringify(reference.phrase)} occurs ${starts.length} times; specify its one-based occurrence.`);
  const start=starts[(reference.occurrence??1)-1];
  if(start===undefined)throw Error('Typography phrase occurrence does not exist in its source field.');
  return{start,end:start+phrase.length};
}

export function resolveTypographyPatch(text:string,input:z.infer<typeof TextTypographyPatchSchema>):TextTypography {
  const {breakAfterText,emphasis,...style}=input;
  if(breakAfterText!==undefined&&style.breakAfter!==undefined)throw Error('Choose breakAfterText or numeric breakAfter, not both.');
  const result=TextTypographySchema.parse({...style,...(breakAfterText!==undefined?{breakAfter:breakAfterText.map(reference=>phraseRange(text,reference).end)}:{}),...(emphasis!==undefined?{emphasis:emphasis.map(span=>'phrase'in span?{...phraseRange(text,span),treatment:span.treatment}:span)}:{})});
  const issues=typographyIssues(text,result);if(issues.length)throw Error(issues.join(' '));return result;
}

export function typographyWordMap(text:string){return(text.match(/\S+/g)??[]).map((word,index)=>({index,word}));}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function typographyIssues(text: string, style?: TextTypography) {
  if (!style) return [];
  const count = (text.match(/\S+/g) ?? []).length, issues: string[] = [];
  if (style.breakAfter && (style.breakAfter.some(n => n >= count) || new Set(style.breakAfter).size !== style.breakAfter.length)) issues.push('Line breaks must address distinct word boundaries inside the source text.');
  if(style.maxLines&&1+(style.breakAfter?.length??0)>style.maxLines)issues.push('The line limit cannot be smaller than the explicitly requested phrase lines.');
  const spans = style.emphasis ?? [];
  if (spans.some(s => s.end <= s.start || s.end > count)) issues.push(`Emphasis must address an existing nonempty word range; this field has ${count} words. Indices are zero-based WORD positions, not characters.`);
  if (spans.some((a, i) => spans.slice(i + 1).some(b => a.start < b.end && b.start < a.end))) issues.push('Emphasis ranges cannot overlap.');
  return issues;
}

/** Shared by Chromium, editable canvas and SVG. Only escaped text and allowlisted styles. */
export function typographyHtml(text: string, style?: TextTypography, accent = '#111111') {
  return typographyParts(text,style).map(({text:token,treatment})=>{
    const safeAccent = /^#[\da-f]{6}$/i.test(accent) ? accent : '#111111';
    const css = treatment === 'accent' ? `color:${safeAccent}` : treatment === 'bold' ? 'font-weight:700' : treatment === 'italic' ? 'font-style:italic' : '';
    return css ? `<span style="${css}">${escape(token)}</span>` : escape(token);
  }).join('');
}

export function typographyParts(text:string,style?:TextTypography):Array<{text:string;treatment?:'accent'|'bold'|'italic'}> {
  if (typographyIssues(text, style).length) return [{text}]; // A later user copy edit can invalidate old ranges.
  const tokens = text.match(/\s+|\S+/g) ?? []; let word = 0;
  return tokens.map(token => {
    if (/^\s+$/.test(token)) return {text:style?.breakAfter?.includes(word) ? '\n' : token};
    const index = word++, span = style?.emphasis?.find(s => index >= s.start && index < s.end);
    return {text:token,treatment:span?.treatment};
  });
}

export function typographyGuide() {
  return 'Use typography independently for title, body, cta, eyebrow, credit, label and detail. leading is a unitless line height (headlines usually 1.0–1.12, prose 1.2–1.4); tracking is em (large headlines often -0.025, small labels up to 0.08); size is a preferred multiplier 0.4–2.0 before measured fitting; primary social text still respects its versioned reading floor, so a smaller multiplier cannot authorize unreadable text; width is a fraction 0.45–1 of the assigned lane. align may be left/center/right; wrap balance/pretty/wrap. Optional maxLines:1–12 expresses a measured line budget for automatic typesetting: reduce only this field from its preferred size until it fits, retaining reading floors and exact words. For explanatory pages, a compact one- or two-line title often gives the diagram room to carry the message. This is not truncation; an impossible limit fails and needs a wider region, reflow or a looser limit. Preserve deliberate phrase breaks; maxLines cannot be smaller than their line count. Omit it for unconstrained type, or set maxLines:null in a partial repair to release an existing limit. Use it sparingly rather than imposing the same title treatment on an entire sequence. Manual freeform object geometry retains its saved type size. breakAfter:[2,5] starts new lines AFTER the second and fifth whitespace-delimited words, without changing source copy. Use only meaningful phrase boundaries, never an orphan article. emphasis:[{start:0,end:2,treatment:"accent"|"bold"|"italic"}] uses zero-based, end-exclusive WORD ranges, at most four non-overlapping ranges. Accent comes from the contrast-safe brand palette. Prefer one emphasized phrase; do not emphasize everything. Deliberate line breaks and a strong scale relationship should express the idea, not merely fill the canvas.' + ' ' + textboxGuide();
}
