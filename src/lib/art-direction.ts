import { z } from 'zod';
import type { ContentBrand } from './content-brand';
import { typographyGuide } from './design-typography';

export const AssetRequestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,50}$/),
  subject: z.string().min(5).max(300), purpose: z.string().min(10).max(400),
  style: z.string().min(5).max(300), placement: z.string().min(5).max(300),
  existingAssetId: z.string().max(120).optional(),
}).strict();

const Direction = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,50}$/), name: z.string().min(3).max(100),
  idea: z.string().min(20).max(800), attention: z.string().min(10).max(600),
  hierarchy: z.string().min(10).max(800), rhythm: z.string().min(10).max(1000),
  assetStrategy: z.string().min(10).max(600),
  assetRequestIds: z.array(z.string()).max(2).default([]),
}).strict();
export const ArtDirectionSchema = z.object({
  version: z.literal(1), referencePrinciples: z.array(z.string().min(5).max(300)).max(6),
  directions: z.array(Direction).length(3),
  assetRequests: z.array(AssetRequestSchema).max(2).default([]),
}).strict();
export const SelectionReviewSchema = z.object({ ready:z.boolean(),reason:z.string().max(2000),issues:z.array(z.string().max(500)).max(8) });
export type ArtDirection = z.infer<typeof ArtDirectionSchema>;

export const CRAFT_REVIEW_STANDARD = 'Calibrate visual craft: 3 means correct but generic, with default typography, a weak focal point or disconnected groups; 4 means a deliberate, coherent design with confident hierarchy, intentional line breaks, balanced optical weight and readable integrated visuals; 5 means exceptional execution with a memorable idea and refined detail. Brand minimalism can earn 5 without illustrations or extra decoration. Do not award 4 merely because nothing clips. A genuine supplied-copy restriction never requires filler. Reject arbitrary variation; repeated brand elements are useful. Judge whether whitespace connects and frames the idea, whether related copy stays together and whether the design is distinctive for this brand and purpose.';

export async function planArtDirection(input:{format:string;brief:string;brand:ContentBrand;referenceNotes:string[];lessons?:unknown;assetAcquisition?:boolean},ask:(prompt:string,images?:string[])=>Promise<string>,images:string[]) {
  const prompt=`You are Ola's creative director BEFORE content representation and final copy. Develop THREE distinct original visual directions for the same communication goal. Each needs a concrete memorable visual idea, an attention mechanism, a type hierarchy, sequence rhythm and an asset strategy. Different alignment or a new color alone is not a new idea. Use the supplied image references to extract specific transferable proportions, type relationships, color restraint, framing and pacing. Never copy artwork or claims. If no images are supplied, say so in referencePrinciples; do not pretend to have seen examples. Preserve every exact supplied word, chosen artwork and requested structure. For flexible wording, describe how copy and visual explanation can work together; do not write final copy. Use available assets, editable native diagrams, or concrete asset commissions when acquisition is enabled. Never invent product screenshots or data. A text-only brief can use a phrase-led typographic idea, a strong editorial reading path or a different scale/color rhythm. The official brand mark stays in the renderer’s protected upper branding area (or cover only when the saved brand requires it); moving it to a footer, corner closing zone or arbitrary position is unavailable. Never make an unavailable logo position part of a direction. Directions must be implementable with measured text, referenced semantic components, stacked or two-column groups, brand palette surfaces controlled phrase emphasis, and optional fine top or inset rules. An inset frame can open on any side through craft.ruleSides; this is a supported native line treatment. Keep each descriptive field concise, preferably one sentence under 180 characters. ${typographyGuide()} ${CRAFT_REVIEW_STANDARD} Return ONLY JSON matching ${JSON.stringify(z.toJSONSchema(ArtDirectionSchema))}.\nFormat: ${input.format}. Brief: ${input.brief}\nBrand: ${JSON.stringify({name:input.brand.name,memory:input.brand.memory,palette:input.brand.palette,typography:input.brand.typography,designSystem:input.brand.designSystem,assets:input.brand.assets.map(a=>({id:a.id,name:a.name}))})}\nReference notes: ${JSON.stringify(input.referenceNotes)}\nExplicit human preference examples (style evidence only, never new claims or copy): ${JSON.stringify(input.lessons??[])}`;
  let error='';
  for(let pass=0;pass<2;pass++)try{
    const acquisition = input.assetAcquisition !== false && input.format !== 'article';
    const assetGuide = `\nAsset acquisition is ${acquisition?'available':'disabled'}. ${acquisition?'You may commission up to TWO concrete missing images through assetRequests, identifying subject, communicative purpose, style and placement. Check existing supplied assets first; set existingAssetId when one already fits. Directions link requests through assetRequestIds. External artwork must be genuinely helpful and allowed by the brief. Photography is appropriate when the subject calls for it. Avoid decorative filler, fake product UI, copyrighted characters and assets that would need extra visible copy prohibited by the brief. Placed images use full-image containment, without forced crops, cutouts or recoloring. Commission a subject and aspect ratio suited to a contained image panel. Keep at least one direction executable with existing assets/native geometry if acquisition fails. This asset commissioning capability supersedes the earlier available-assets-only instruction, but never a user restriction.':'Return assetRequests:[] and do not depend on missing images.'} Reference-only brand previews cannot be reused as artwork. Never request external images for a brief that prohibits them.`;
    const raw=await ask(prompt+assetGuide+(error?`\nPrevious response rejected: ${error}`:''),images);
    const result=ArtDirectionSchema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,'')));
    if(new Set(result.directions.map(d=>d.id)).size!==3||new Set(result.directions.map(d=>d.idea)).size!==3)throw Error('Directions need three unique IDs and distinct ideas.');
    const ids=new Set(result.assetRequests.map(r=>r.id));
    if(ids.size!==result.assetRequests.length||result.directions.some(d=>d.assetRequestIds.some(id=>!ids.has(id))))throw Error('Asset request IDs must be unique and direction references must resolve.');
    if(!acquisition&&result.assetRequests.length)throw Error('Asset acquisition is disabled for this run.');
    if(result.assetRequests.some(r=>r.existingAssetId&&!input.brand.assets.some(a=>a.id===r.existingAssetId)))throw Error('An existing asset request must use a supplied artwork ID.');
    return result;
  }catch(e){error=e instanceof Error?e.message:String(e);}
  throw Error('Art direction planning failed: '+error);
}

export function artDirectionCompositionGuide(direction:ArtDirection) {
  return `Produce EXACTLY THREE complete candidates, in direction order ${direction.directions.map(d=>d.id).join(', ')}. Every page in a candidate carries that directionId and expresses its idea through geometry and typography, not only a renamed family. Art direction: ${JSON.stringify(direction)}. Use typography.title and typography.body deliberately, with hierarchy suited to copy length. Use responsive.craft:{version:1,surface:"background"|"alternate"|"dark"|"accent",horizontalAnchor:"left"|"center"|"right",measure:0.65..1,distribution:"packed"|"spread",stagger:0..0.2,rule:"none"|"top"|"inset",ruleSides?:["top"|"right"|"bottom"|"left",...],accentRule:boolean}. An inset rule frames the usable reading field with a safe gutter; ruleSides selects its visible edges, for example ["top","left","bottom"] leaves the right side open. Omission or null restores all four sides. Top-rule mode always draws only the top edge; top adds one restrained horizontal rule; accentRule adds a separate short anchoring stroke above the reading field. Request a rule only when it is part of the visual idea. Defaults retain original full-width packed geometry. Use color changes only for purposeful narrative beats and respect brand notes prohibiting them. Keep related text packed; spread is for deliberate separated reading beats. Stagger offsets body relative to title in text columns. The requested visual must remain central and legible; do not shrink a diagram to accommodate an oversized heading. At least one candidate should be a confident editorial interpretation; do not make all alternatives the same centered stack. ${typographyGuide()}`;
}
