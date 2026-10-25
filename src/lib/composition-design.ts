import { z } from 'zod';

// Ratios are relative to the usable canvas, so the same plan works at any aspect ratio.
const gap = z.number().min(.008).max(.08);
const textTarget = z.enum(['title', 'body', 'cta']);
const groupTarget = z.enum(['content', 'copy', 'artwork']);
const RuleSidesSchema=z.array(z.enum(['top','right','bottom','left'])).min(1).max(4).refine(sides=>new Set(sides).size===sides.length,'Frame sides must be unique.').nullable();
export const LayoutActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('spacing'), target: z.enum(['content', 'copy', 'visual']), gap }).strict(),
  z.object({ action: z.literal('attach'), target: z.enum(['body', 'cta', 'credit']), to: z.enum(['title', 'body', 'artwork']), gap }).strict(),
  z.object({ action: z.literal('scale'), target: z.enum(['title', 'body', 'cta', 'artwork']), factor: z.number().min(.75).max(1.3) }).strict(),
  z.object({ action: z.literal('align'), target: textTarget, align: z.enum(['left', 'center']) }).strict(),
  z.object({ action: z.literal('move'), target: groupTarget, dx: z.number().min(-.12).max(.12), dy: z.number().min(-.12).max(.12) }).strict(),
  z.object({ action: z.literal('reflow'), arrangement: z.enum(['stack', 'columns']) }).strict(),
]);
export type LayoutAction = z.infer<typeof LayoutActionSchema>;
// Patches must not insert defaults: a rule-only repair must retain the chosen surface and grid.
export const CraftPatchSchema = z.object({
  version: z.literal(1).optional(),
  surface: z.enum(['background','alternate','dark','accent']).optional(),
  horizontalAnchor: z.enum(['left','center','right']).optional(),
  measure: z.number().min(.65).max(1).optional(),
  distribution: z.enum(['packed','spread']).optional(),
  stagger: z.number().min(0).max(.2).optional(),
  rule: z.enum(['none','top','inset']).optional(),
  ruleSides:RuleSidesSchema.optional(),
  accentRule: z.boolean().optional(),
}).strict();
export const ResponsiveLayoutSchema = z.object({
  version: z.literal(1),
  // Saved scenes retain their previous geometry unless explicitly upgraded.
  balance: z.object({ version: z.literal(1) }).strict().optional(),
  readability: z.object({ version: z.literal(1) }).strict().optional(),
  arrangement: z.enum(['auto', 'stack', 'columns']).default('auto'),
  anchor: z.enum(['start', 'center', 'end']).default('center'),
  focal: z.enum(['title', 'artwork']).default('title'),
  gap: gap.default(.03),
  visualWeight: z.number().min(.25).max(.65).default(.43),
  craft: z.object({
    version: z.literal(1),
    surface: z.enum(['background','alternate','dark','accent']).default('background'),
    horizontalAnchor: z.enum(['left','center','right']).default('left'),
    measure: z.number().min(.65).max(1).default(1),
    distribution: z.enum(['packed','spread']).default('packed'),
    stagger: z.number().min(0).max(.2).default(0),
    rule: z.enum(['none','top','inset']).optional(),
    ruleSides:RuleSidesSchema.optional(),
    accentRule: z.boolean().optional(),
  }).strict().optional(),
  visual: z.object({
    treatment: z.enum(['plain', 'cards', 'numbered', 'annotated']).default('plain'),
    direction: z.enum(['auto', 'horizontal', 'vertical']).default('auto'),
    nodes:z.enum(['none','dots']).nullable().optional(),
    textFlow:z.enum(['regions','grouped']).optional(),
    // Labels are references to existing copy. Coordinates identify a point in the contained image.
    annotations: z.array(z.object({ copyId: z.string().min(1).max(100), x: z.number().min(.02).max(.98), y: z.number().min(.02).max(.98) }).strict()).max(4).default([]),
  }).strict().default({ treatment: 'plain', direction: 'auto', annotations: [] }),
  surfaces: z.array(z.object({ target: z.enum(['body', 'cta']), treatment: z.literal('panel'), reason: z.string().trim().min(8).max(240) }).strict()).max(2).optional(),
  adjustments: z.array(LayoutActionSchema).max(16).default([]),
}).strict();
export type ResponsiveLayout = z.infer<typeof ResponsiveLayoutSchema>;

/** Local structural controls, without the defaults that belong to a new composition. */
export const ResponsivePatchSchema = z.object({
  readability: ResponsiveLayoutSchema.shape.readability,
  arrangement: ResponsiveLayoutSchema.shape.arrangement.removeDefault().optional(),
  anchor: ResponsiveLayoutSchema.shape.anchor.removeDefault().optional(),
  focal: ResponsiveLayoutSchema.shape.focal.removeDefault().optional(),
  visualWeight: ResponsiveLayoutSchema.shape.visualWeight.removeDefault().optional(),
  visual: z.object({
    treatment: ResponsiveLayoutSchema.shape.visual.removeDefault().shape.treatment.removeDefault().optional(),
    direction: ResponsiveLayoutSchema.shape.visual.removeDefault().shape.direction.removeDefault().optional(),
    nodes:ResponsiveLayoutSchema.shape.visual.removeDefault().shape.nodes,
    textFlow:ResponsiveLayoutSchema.shape.visual.removeDefault().shape.textFlow,
    annotations: ResponsiveLayoutSchema.shape.visual.removeDefault().shape.annotations.removeDefault().optional(),
  }).strict().optional(),
  surfaces: ResponsiveLayoutSchema.shape.surfaces,
}).strict();

export function responsiveLayoutGuide() {
  return 'Every new plan must include responsive:{version:1,...}. With readability:{version:1} and no visual recipe, neutral visualContent example fields and checklist, processSteps and hubSpoke components use measured native labels, details, tags, headings and notes instead of a component image. Use responsive.arrangement columns ONLY to put page copy and the visual in separate lanes; use responsive.visual.direction horizontal to put the existing items side by side within that visual, vertical to stack them. A headline above three equal fields needs arrangement stack plus visual.direction horizontal, not arrangement columns alone. For neutral example fields, auto stacks the items; no checklist marks, arrows or reserved marker space are added. They can use visual.direction horizontal/vertical, and narrow columns reflow without shrinking below reading floors. Keep bodyMode text to preserve their existing canonical fields. A hub retains its central context above equally weighted peers and branches only from that context, never from peer to peer. Its label/detail typography and shared-headline typography are measured; visual.nodes:none does not remove the central association. Neutral independent fields should use the existing visualContent example layout instead of introducing hub connectors. Numbered treatment is for the ordered process only; a checklist uses check marks without implied sequence by default. For neutral complementary label/detail fields rather than tasks, keep the same native checklist layout and set visual.nodes:"none": omit the marks and their reserved space, retaining grouping and all source copy; nodes:null restores the default marks. This reuses the existing component rather than inventing a new diagram kind. The renderer measures brand-font glyphs, packs related groups and contains original images before exporting. arrangement auto follows the family; stack or columns is an explicit choice. anchor controls the packed group, gap is a fraction of the shorter usable dimension, visualWeight controls visual prominence. focal artwork requires an image or diagram. For an existing designed semantic component, visual.textFlow:"grouped" packs each unambiguous canonical item label/detail/tag stack using measured heights and a shared gap, without adding surfaces or changing copy. This top-aligns other text regions. Omit textFlow to keep saved region placement; use "regions" to restore it. Side-by-side fields, intervening text and separate surfaces keep their independent regions. Plain is the default, including processes, comparisons and grids. Use cards only for meaningful independent groups, not to fill space. Filled body/CTA panels require an explicit surfaces:[{target:"body" or "cta",treatment:"panel",reason:"why a surface is needed"}]. Omit surfaces for ordinary prose. Numbered treatment requires an ordered sequence. For a connected process with station markers and a continuous native route, set visual.nodes:"dots"; this adds no numbers or visible copy. Omit nodes to preserve the existing plain treatment. nodes:"dots" applies to connected native processes, not statements or data charts; nodes:"none" can also suppress checklist completion marks for neutral peer fields. Use annotated only with a selected image: annotations reference existing body or component-label copy IDs (body, body-0, etc), and x/y identify a point in the ORIGINAL contained image. Labels move into adjacent callouts, appearing exactly once. Every bound diagram label must be annotated in this mode. Never invent labels, data, image details, crop imagery, or introduce decorative charts. An image and an existing semantic component may appear together. Choose a strong focal point that expresses the communication goal, with deliberate grouping and hierarchy. For explanatory content, make the diagram a main reading surface, not a thumbnail below an oversized headline. For short copy, use deliberate type scale, alignment and spacing; keep ordinary prose unboxed and vary the reading direction across the sequence; do not repeat a tiny floating sentence on a largely empty canvas. Do not invent content to fill space. For social formats, core text is checked at a 360px phone viewing width from measured font sizes, not enlarged previews. Minimums are 14px for headlines, 11px for explanatory body/detail and labels, and 10px for actions (42/33/30 design pixels at 1080px width). New pipeline compositions automatically enable readability:{version:1}; their primary social text cannot shrink below these floors during fitting. Legacy scenes keep their saved sizing until explicitly upgraded. Use typography.label/detail deliberately and scale or reflow the visual rather than shrinking explanation text. Credits and protected branding have separate roles. Protected Story interface space remains empty.';
}

export const VisualFindingSchema = z.object({
  page: z.number().int().min(1).max(20),
  targets: z.array(z.string().min(1).max(120)).min(1).max(6),
  problem: z.string().min(1).max(500),
  successCriterion: z.string().min(1).max(500),
}).strict();
export function layoutRepairGuide() {
  return 'Use typography patches for title/body/cta leading, tracking, size, width, align, wrap, measured maxLines, word-based breakAfter and emphasis without rewriting copy. Use maxLines:2 to compact an oversized heading at measured readable sizes; maxLines:null releases an earlier line limit. Use craft patches for palette surface, content measure, horizontalAnchor, packed/spread distribution, stagger and explicit frame sides. For rule:inset, ruleSides:[top,left,bottom] opens the right side; ruleSides:null restores the full frame. This changes native strokes only, preserving text and geometry; retain unrelated choices. Use responsive patches with readability:{version:1} to upgrade a legacy social composition to measured reading floors without rewriting its copy. Reflow when necessary rather than shrinking below the floor. Use responsive patches for arrangement (auto/stack/columns), anchor (start/center/end), focal (title/artwork), visualWeight, visual:{direction:auto/horizontal/vertical,nodes:none/dots,textFlow:regions/grouped,treatment:plain/cards/numbered/annotated,annotations:[existing copy references]}, and surfaces. Use visual.textFlow:"grouped" for disconnected label/detail spacing in a designed semantic component, retaining its specification and canonical copy; "regions" restores independent region placement. These are partial changes: omitted settings, copy bindings, recipe and craft survive. A direct arrangement replaces earlier reflow actions. Set resetLayoutActions:true to clear the targeted page\'s earlier move/scale/attach/reflow actions before applying a fresh layout; its family, recipe, craft and copy bindings remain. This is useful when accumulated transforms prevent larger readable text from fitting. Set surfaces:[] to remove explicitly requested panels. Change visual.direction to reorient existing connected stages without replanning or rewriting them. Change arrangement to place headline and visual side by side or in a stack. Preserve faithful relationships and do not add numbering to unordered data. Use layoutActions for local geometric defects on composed pages. Available actions: spacing(content/copy/visual,gap), where visual spacing separates native list/related-pair entries while preserving their close label/detail gaps; attach(body/cta/credit,to:title/body/artwork,gap); scale(title/body/cta/artwork,factor); align(title/body/cta,align:left/center); move(content/copy/artwork,dx,dy); reflow(arrangement:stack/columns). Groups, labels, connectors and image-containment stay together. Ratios refer to usable content bounds, never device pixels. Preserve the family, recipe ID and unrelated groups for a local fix. Recipe-aware fitting keeps each format native. Use compositionPlan only for a material change of visual idea. bodyMode:text preserves independent canonical component fields. The sequence/comparison/grid body modes SEGMENT an existing literal supporting paragraph; they do not arrange an existing component into rows or columns. Never use them when body is empty or when they would discard independent fields. Reorient an existing component with responsive controls, or supply a source-preserving semanticComponent replacement together with a bodyMode:text plan. Resolve @copy bindings to their approved words in an explicit replacement; preserve the headline exactly once. Use the actual page/group/element IDs from renderEvidence; explain the defect and an observable success criterion. Do not move protected branding or progress chrome. A failed action is rejected, never silently substituted. Do not combine geometry actions with copy rewrites. To repair explicitly supplied label/detail pairs flattened into a supporting paragraph, a separate source-preserving patch may set body:"", supply semanticComponent with exactly those pairs in separate label/detail fields and no added headers/tags, and provide compositionPlan with bodyMode:"text". All paragraph words must transfer, all exact roles and required copy must survive, and the old paragraph bindings are rebuilt. A separately supplied whole supporting-line requirement stays locked. This is a canonical field transfer, not authorization to rewrite the source. The next pass must inspect the actual re-rendered image and check the original defect plus new clipping/collision/spacing issues.';
}
