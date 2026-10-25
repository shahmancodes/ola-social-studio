import { z } from 'zod';
const color = z.string().regex(/^#[\da-f]{6}$/i);
/** Explicit, portable brand choices. Stored in the brand snapshot and never inferred from a critique. */
export const BrandDesignSchema = z.object({
  family: z.enum(['editorial', 'grid', 'poster']).optional(),
  headingFontName: z.string().max(200).optional(), bodyFontName: z.string().max(200).optional(),
  headingFontId: z.string().optional(), bodyFontId: z.string().optional(),
  palette: z.object({ background: color, alternate: color, accent: color, ink: color, dark: color }).optional(),
  bodyScale: z.number().min(0.9).max(1.4).default(1.1),
  spacing: z.enum(['compact', 'balanced', 'generous']).default('balanced'),
  logoTreatment: z.enum(['original', 'light-surface']).default('light-surface'),
  logoPlacement: z.enum(['each-page', 'cover-only']).optional(),
  notes: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
});
export type BrandDesign = z.infer<typeof BrandDesignSchema>;
/** Legacy renderer family was defaulted to editorial for every brand. It is not brand evidence. */
export function brandDesignForPlanning(value: unknown): BrandDesign {
  const { family: _legacyFamily, ...design } = BrandDesignSchema.parse(value ?? {});
  return design;
}
export function luminance(hex: string) { return [1,3,5].reduce((n,i,k)=>{const c=parseInt(hex.slice(i,i+2),16)/255;return n+(c<=.04045?c/12.92:((c+.055)/1.055)**2.4)*[.2126,.7152,.0722][k];},0); }
export function contrast(a: string,b: string) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
export function readableInk(background: string, preferred: string) { return contrast(background,preferred)>=4.5?preferred:contrast(background,'#FFFFFF')>=4.5?'#FFFFFF':'#111111'; }
