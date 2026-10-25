import {semanticDesignIssues,componentSources} from "./semantic-design";
import { z } from "zod";
import { DesignTypographySchema, typographyGuide, typographyIssues } from './design-typography';
import { SemanticComponentSchema } from "./schemas";
import { ResponsiveLayoutSchema, responsiveLayoutGuide } from "./composition-design";
import { isConsistentDataSequence } from './sequence-design';
import type { SimpleArtifact } from "./simple-content";
import { DESIGN_RECIPES, DesignRecipeSchema, recipeIssues, recipeGuide, recipeProfile } from './design-recipes';

export const COMPOSITION_FAMILIES = ["oversized-typography", "asymmetric-editorial", "image-led", "diagram-led", "comparison", "modular-grid"] as const;
const sourcePattern = /^(visualContent\.items\.\d+\.(label|detail)|title|body|cta|credit|eyebrow|semanticComponent\.(prompt|answer|leftTitle|rightTitle|takeaway|note|unit|items\.\d+\.(label|detail|tag)))$/;
export const CompositionPlanSchema = z.object({
  family: z.enum(COMPOSITION_FAMILIES),
  directionId: z.string().max(80).optional(),
  typography: DesignTypographySchema.optional(),
  recipe: DesignRecipeSchema.optional(),
  responsive: ResponsiveLayoutSchema.optional(),
  intent: z.object({ goal: z.string().min(1).max(300), relationship: z.enum(["sequence", "contrast", "relationship", "demonstration", "statement"]), reason: z.string().min(1).max(500) }).strict(),
  tuning: z.object({ split: z.number().min(.35).max(.65).default(.52), scale: z.number().min(.85).max(1.15).default(1), density: z.enum(["airy", "balanced", "compact"]).default("balanced"), align: z.enum(["left", "center"]).default("left"), mirror: z.boolean().default(false), headingFontId: z.string().max(120).optional(), bodyFontId: z.string().max(120).optional() }).strict().default({ split: .52, scale: 1, density: "balanced", align: "left", mirror: false }),
  bodyMode: z.enum(["text", "sequence", "comparison", "grid"]).default("text"),
  separator: z.string().min(1).max(12).optional(),
}).strict();
export const CompositionSchema = CompositionPlanSchema.extend({
  version: z.literal(1),
  blocks: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), source: z.string().regex(sourcePattern), segment: z.object({ separator: z.string().min(1).max(12), index: z.number().int().min(0).max(11) }).strict().optional() }).strict()).min(1).max(100),
  placements: z.array(z.object({ copyId: z.string(), slot: z.string().regex(sourcePattern) }).strict()).min(1).max(100),
}).strict();
export type Composition = z.infer<typeof CompositionSchema>;
export type CompositionPlan = z.infer<typeof CompositionPlanSchema>;
export const CompositionCandidatesSchema = z.object({ candidates: z.array(z.object({ pages: z.array(CompositionPlanSchema) }).strict()).min(2).max(3) }).strict();
export type CopyPage = { semanticDesign?:import("./semantic-design").SemanticDesign; supportingAssetIds?:string[]; editorAppearance?: import("./editor-appearance").EditorAppearance; visualOverrides?: import("./content-layout").VisualPage["visualOverrides"]; layout?: import("./visual-layout-types").VisualLayout; title: string; body: string; cta?: string; credit?: string; eyebrow?: string; assetId?: string; visualContent?: {kind:"checklist"|"process"|"comparison"|"example";items:Array<{label:string;detail:string}>}; semanticComponent?: z.infer<typeof SemanticComponentSchema>; composition?: Composition };
const REF = "@copy:";
export const isCopyReference = (value: string) => value.startsWith(REF);

export function copySource(page: CopyPage, source: string): string {
  if (!sourcePattern.test(source)) throw new Error(`Unsupported copy source: ${source}`);
  let value: unknown = page;
  for (const key of source.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return typeof value === "string" ? value : "";
}
function setSource(page: CopyPage, source: string, value: string) {
  const keys = source.split("."); let node: unknown = page;
  for (const key of keys.slice(0, -1)) node = (node as Record<string, unknown>)[key];
  (node as Record<string, unknown>)[keys.at(-1)!] = value;
}
export function copyText(page: CopyPage, id: string): string {
  const block = page.composition?.blocks.find(b => b.id === id);
  if (!block) throw new Error(`Unresolved copy reference: ${id}`);
  const value = copySource(page, block.source);
  if (isCopyReference(value)) throw new Error(`Copy references cannot be chained: ${id}`);
  if (!block.segment) return value;
  const parts = value.split(block.segment.separator);
  if (parts.length < 2 || block.segment.index >= parts.length || !parts[block.segment.index].trim()) throw new Error(`Copy segmentation no longer matches ${block.source}.`);
  return parts[block.segment.index].trim();
}
export function componentCopySources(page: CopyPage) {
  const c = page.semanticComponent; if (!c) return [];
  return ["prompt", "answer", "leftTitle", "rightTitle", "takeaway", "note", "unit", ...c.items.flatMap((_, i) => ["label", "detail", "tag"].map(k => `items.${i}.${k}`))].map(k => `semanticComponent.${k}`);
}
export function visualCopySources(page: CopyPage) {
  return page.visualContent?.items.flatMap((_,i)=>[`visualContent.items.${i}.label`,`visualContent.items.${i}.detail`]) ?? [];
}
export function compositionIssues(page: CopyPage): string[] {
  if (!page.composition) return [];
  const checked = CompositionSchema.safeParse(page.composition);
  if (!checked.success) return ["Invalid composition schema."];
  const c = checked.data, issues: string[] = [], ids = new Set<string>();
  for (const slot of ['title','body','cta','eyebrow','credit'] as const) issues.push(...typographyIssues(copySource(page,slot),c.typography?.[slot]).map(issue=>`${slot}: ${issue}`));
  if(page.semanticDesign)issues.push(...semanticDesignIssues(page.semanticDesign.spec,componentSources(page.semanticComponent)));
  issues.push(...recipeIssues(page,c));
  if(page.supportingAssetIds?.length&&c.recipe?.id!=='apple-triptych')issues.push('Additional image slots require the triptych recipe.');
  for (const b of c.blocks) { if (ids.has(b.id)) issues.push(`Duplicate copy ID: ${b.id}`); ids.add(b.id); try { if (!copyText(page, b.id).trim()) issues.push(`Empty copy block: ${b.id}`); } catch (e) { issues.push(String((e as Error).message)); } }
  const slots = new Set<string>();
  for (const p of c.placements) {
    if (!ids.has(p.copyId)) issues.push(`Unresolved copy reference: ${p.copyId}`);
    if (slots.has(p.slot)) issues.push(`Duplicate placement slot: ${p.slot}`); slots.add(p.slot);
    if (p.slot.startsWith("semanticComponent.") || p.slot.startsWith("visualContent.")) {
      const block=c.blocks.find(b=>b.id===p.copyId),value=copySource(page,p.slot);
      if(value!==REF+p.copyId&&!(block?.source===p.slot&&!block.segment&&!isCopyReference(value)))issues.push(`Component placement is not a copy reference or canonical component field: ${p.slot}`);
    }
  }
  for (const b of c.blocks) if (c.placements.filter(p => p.copyId === b.id).length !== 1) issues.push(`Copy must be placed exactly once: ${b.id}`);
  for (const source of ["title", "body", "cta", "credit", "eyebrow", ...componentCopySources(page), ...visualCopySources(page)]) {
    const value = copySource(page, source); if (!value.trim() || isCopyReference(value)) continue;
    const blocks = c.blocks.filter(b => b.source === source);
    const whole = blocks.filter(b => !b.segment), segments = blocks.filter(b => b.segment);
    if (whole.length === 1 && !segments.length) continue;
    if (!whole.length && segments.length) {
      const separator = segments[0].segment!.separator, parts = value.split(separator);
      if (segments.every(b => b.segment!.separator === separator) && parts.length === segments.length && new Set(segments.map(b => b.segment!.index)).size === parts.length && parts.every(p => p.trim())) continue;
    }
    issues.push(`Missing or duplicated copy coverage: ${source}`);
  }
  for (const source of [...componentCopySources(page), ...visualCopySources(page)]) {
    const value = copySource(page, source);
    if (isCopyReference(value) && !c.placements.some(p => p.slot === source && REF + p.copyId === value)) issues.push(`Unbound component label: ${source}`);
  }
  if (c.bodyMode === 'text' && page.body.trim() && page.semanticComponent) {
    const labels = page.semanticComponent.items.map((_,i)=>{ const p=c.placements.find(p=>p.slot===`semanticComponent.items.${i}.label`); return p?copyText(page,p.copyId):''; });
    if(labels.length>1&&[' → ','\n',' | ','; '].some(separator=>labels.join(separator)===page.body))issues.push('Supporting copy and the diagram repeat the same ordered labels; use one referenced representation.');
  }
  // Equal wording in different component cells is still independent canonical copy.
  const words = c.blocks.filter(b=>!b.segment&&!/^(?:semanticComponent|visualContent)\./.test(b.source)).map(b => { try { return copyText(page, b.id).trim(); } catch { return ""; } }).filter(Boolean);
  if (new Set(words).size !== words.length) issues.push("The same copy is stored in more than one visible block.");
  if (c.family === "image-led" && !page.assetId) issues.push("Image-led composition requires selected artwork.");
  if (c.family === "diagram-led" && !page.semanticComponent && !page.visualContent) issues.push("Diagram-led composition requires a semantic component.");
  if (c.bodyMode === "sequence" && page.semanticComponent?.kind !== "timeline") issues.push("Sequence copy requires a timeline component.");
  if(c.bodyMode!=='text')for(const b of c.blocks.filter(b=>b.source==='body'&&b.segment))if(!c.placements.some(p=>p.copyId===b.id&&p.slot===`semanticComponent.items.${b.segment!.index}.label`))issues.push('The supplied copy segments changed reading order.');
  if (c.family === "comparison" && c.bodyMode !== "comparison" && page.semanticComponent?.kind !== "comparison" && page.visualContent?.kind !== "comparison") issues.push("Comparison composition requires two explicit comparison groups.");
  const r = c.responsive;
  if (r) {
    const nativeList=Boolean(r.readability)&&c.bodyMode==='text'&&!page.assetId&&!c.recipe&&!page.semanticDesign&&['checklist','processSteps','hubSpoke'].includes(page.semanticComponent?.kind??'');
    if(page.semanticDesign&&r.arrangement==='columns')issues.push('Designed components require a full-width visual group; choose stack or auto until a narrow-column proof exists.');
    const surfaces=r.surfaces??[];
    if(new Set(surfaces.map(s=>s.target)).size!==surfaces.length)issues.push("Duplicate surface target.");
    for(const s of surfaces)if(!c.placements.some(p=>p.slot===s.target))issues.push(`Surface targets missing copy: ${s.target}`);
    const hasArtwork = Boolean(page.assetId || page.semanticComponent || page.visualContent);
    if (r.focal === 'artwork' && !hasArtwork) issues.push('Artwork focus requires an image or semantic component.');
    if(r.visual.treatment!=='plain'&&!hasArtwork)issues.push('A visual treatment requires a visual group.');
    if(r.visual.treatment==='numbered'&&c.bodyMode!=='sequence'&&page.visualContent?.kind!=='process'&&!(nativeList&&page.semanticComponent?.kind==='processSteps'))issues.push('Numbered treatment requires an explicit ordered sequence.');
    if(r.visual.textFlow&&!page.semanticDesign)issues.push('Text flow requires an existing designed semantic component.');
    if(r.visual.nodes==='dots'&&(page.semanticDesign||c.bodyMode!=='sequence'&&page.visualContent?.kind!=='process'&&c.recipe?.id!=='tahta-timeline'&&!(nativeList&&page.semanticComponent?.kind==='processSteps')))issues.push('Process station dots require an existing native connected sequence.');
    if(r.visual.direction!=='auto'&&c.bodyMode==='text'&&!page.visualContent&&!nativeList)issues.push('Native diagram direction requires referenced stages or structured visual items. For a plain text page set responsive.visual.direction to auto; use responsive.arrangement for columns or stacking.');
    if(nativeList&&r.visual.treatment==='annotated')issues.push('Native lists use measured text and cannot use image annotations.');
    const annotated = new Set<string>();
    if (r.visual.treatment === 'annotated' && (page.visualContent || !page.assetId || !r.visual.annotations.length)) issues.push('Annotated treatment requires selected artwork and existing copy labels.');
    if (r.visual.treatment !== 'annotated' && r.visual.annotations.length) issues.push('Annotation points require annotated treatment.');
    for (const a of r.visual.annotations) {
      const p = c.placements.find(p => p.copyId === a.copyId);
      if (!p || !(p.slot === 'body' || /^semanticComponent\.items\.\d+\.label$/.test(p.slot))) issues.push(`Unsupported annotation copy reference: ${a.copyId}`);
      if (annotated.has(a.copyId)) issues.push(`Duplicate annotation: ${a.copyId}`);
      annotated.add(a.copyId);
    }
    if (r.visual.treatment === 'annotated') {
      for (const p of c.placements.filter(p => p.slot.startsWith('semanticComponent.'))) if (!annotated.has(p.copyId)) issues.push(`Annotate every diagram label: ${p.copyId}`);
    }
    const exists = (target: string) => target === 'content' || target === 'copy' || (target === 'visual' || target === 'artwork') && hasArtwork || c.placements.some(p => p.slot === target && !r.visual.annotations.some(a=>a.copyId===p.copyId));
    const attachments = new Map<string,string>();
    const scales = new Map<string,number>();
    for (const action of r.adjustments) {
      if ('target' in action && !exists(action.target) && !(action.action==='align'&&c.placements.some(p=>p.slot===action.target))) issues.push(`Layout action targets a missing group: ${action.target}`);
      if (action.action === 'attach') {
        if (!exists(action.to) || action.to === action.target) issues.push('Invalid attachment anchor.');
        attachments.set(action.target, action.to);
      }
      if (action.action === 'scale') {
        const value = (scales.get(action.target) ?? 1) * action.factor; scales.set(action.target, value);
        if (value < .65 || value > 1.5) issues.push('Cumulative layout scaling exceeds safe bounds.');
      }
    }
    for (const target of attachments.keys()) {
      const visited = new Set<string>(); let node: string | undefined = target;
      while (node && attachments.has(node)) { if (visited.has(node)) { issues.push('Layout attachments contain a cycle.'); break; } visited.add(node); node = attachments.get(node); }
    }
  }
  return [...new Set(issues)];
}

/** Text lives in existing editable fields; the registry stores references, never another text value. */
export function composePage(input: CopyPage, raw: unknown): CopyPage {
  const page = structuredClone(input), plan = CompositionPlanSchema.parse(raw);
  if(page.semanticDesign&&plan.recipe)throw new Error('A designed component owns its visual geometry; use a custom composition without a visual recipe.');
  if(plan.recipe&&plan.responsive){const defaults=recipeProfile(plan.recipe.id,'poster');if(plan.responsive.visualWeight===.43)plan.responsive.visualWeight=defaults.weight;}
  // A replan back to prose removes only diagrams whose entire copy was projected from that prose.
  // Canonical component fields are never discarded.
  const prior = input.composition;
  if (prior && prior.bodyMode !== 'text' && plan.bodyMode === 'text' && page.semanticComponent) {
    const componentPlacements = prior.placements.filter(p=>p.slot.startsWith('semanticComponent.'));
    if (componentPlacements.length && componentPlacements.every(p=>prior.blocks.some(b=>b.id===p.copyId&&b.source==='body'&&b.segment)) && componentCopySources(page).filter(s=>copySource(page,s).trim()).every(s=>componentPlacements.some(p=>p.slot===s))) page.semanticComponent = undefined;
  }
  delete page.composition;
  const blocks: Composition["blocks"] = [], placements: Composition["placements"] = [];
  const add = (source: string, slot = source, segment?: Composition["blocks"][number]["segment"]) => {
    const id = source.replaceAll(".", "-") + (segment ? `-${segment.index}` : "");
    blocks.push({ id, source, ...(segment ? { segment } : {}) }); placements.push({ copyId: id, slot }); return id;
  };
  if (plan.bodyMode !== "text") {
    if(page.visualContent)throw new Error("Use the existing structured visual without replacing its approved copy.");
    if (page.semanticComponent && componentCopySources(page).some(source => { const value = copySource(page, source); return value.trim() && !isCopyReference(value) && !page.body.includes(value); })) throw new Error('Copy segmentation cannot discard existing component copy.');
    const separator = plan.separator ?? (page.body.includes(" → ") ? " → " : "\n");
    const parts = page.body.split(separator);
    const max = plan.bodyMode === "comparison" ? 2 : 8;
    if (parts.length < 2 || parts.length > max || parts.some(p => !p.trim())) throw new Error(`The ${plan.bodyMode} plan requires explicit ${separator === "\n" ? "newline" : separator} separated copy.`);
    plan.separator = separator;
    if (plan.bodyMode === "sequence") {
      page.semanticComponent = SemanticComponentSchema.parse({ kind: "timeline", style: page.semanticComponent?.style, items: parts.map((_, index) => ({ label: REF + `body-${index}` })) });
      parts.forEach((_, index) => add("body", `semanticComponent.items.${index}.label`, { separator, index }));
    } else parts.forEach((_, index) => add("body", `semanticComponent.items.${index}.label`, { separator, index }));
    if (plan.bodyMode !== "sequence") {
      page.semanticComponent = SemanticComponentSchema.parse({ kind: "checklist", items: parts.map((_, index) => ({ label: REF + `body-${index}` })) });
    }
  } else if (page.body.trim()) add("body");
  for (const source of ["title", "cta", "credit", "eyebrow"]) if (copySource(page, source).trim()) add(source);
  // If a component repeats an entire text field, reference that field and remove its standalone placement.
  for (const source of componentCopySources(page)) {
    const value = copySource(page, source); if (!value.trim() || isCopyReference(value)) continue;
    const match = blocks.find(b => !b.segment&&!/^(?:semanticComponent|visualContent)\./.test(b.source)&&placements.some(p=>p.copyId===b.id&&p.slot===b.source)&&copySource(page, b.source) === value);
    if (match) { const p = placements.find(p => p.copyId === match.id)!; p.slot = source; setSource(page, source, REF + match.id); }
    else add(source);
  }
  for (const source of visualCopySources(page)) {
    const value=copySource(page,source);if(!value.trim()||isCopyReference(value))continue;
    const match=blocks.find(b=>!b.segment&&!/^(?:semanticComponent|visualContent)\./.test(b.source)&&placements.some(p=>p.copyId===b.id&&p.slot===b.source)&&copySource(page,b.source)===value);
    if(match){placements.find(p=>p.copyId===match.id)!.slot=source;setSource(page,source,REF+match.id);}else add(source);
  }
  page.composition = CompositionSchema.parse({ ...plan, version: 1, blocks, placements });
  const issues = compositionIssues(page); if (issues.length) throw new Error(issues.join(" "));
  resolvedComponent(page); // Validate projected text against the native component's actual capabilities.
  return page;
}

export function resolvedComponent(page: CopyPage) {
  if (!page.semanticComponent || !page.composition) return page.semanticComponent;
  const result = structuredClone(page);
  for (const p of page.composition.placements) if (p.slot.startsWith("semanticComponent.")) setSource(result, p.slot, copyText(page, p.copyId));
  return SemanticComponentSchema.parse(result.semanticComponent);
}

export function resolvedVisualContent(page: CopyPage) {
  if(!page.visualContent||!page.composition)return page.visualContent;
  const result=structuredClone(page);
  for(const p of page.composition.placements)if(p.slot.startsWith('visualContent.'))setSource(result,p.slot,copyText(page,p.copyId));
  return result.visualContent;
}

export function setCopyText(page: CopyPage, id: string, value: string): CopyPage {
  const result = structuredClone(page), block = page.composition?.blocks.find(b => b.id === id);
  if (!block) throw new Error(`Unknown copy block: ${id}`);
  if (block.segment) {
    if (value.includes(block.segment.separator)) throw new Error("A diagram label cannot contain its stage separator.");
    const parts = copySource(page, block.source).split(block.segment.separator); parts[block.segment.index] = value; setSource(result, block.source, parts.join(block.segment.separator));
  } else setSource(result, block.source, value);
  const role=block.source as 'title'|'body'|'cta'|'credit'|'eyebrow';
  const typography=result.composition?.typography?.[role];
  if(typography&&typographyIssues(copySource(result,block.source),typography).length){
    // User edits own the copy. Retain type metrics, discard ranges that no longer address its words.
    delete typography.breakAfter;delete typography.emphasis;
  }
  return result;
}

export function artifactPages(artifact: SimpleArtifact): CopyPage[] {
  if (artifact.type === "story" || artifact.type === "poster" || artifact.type === "post") return [{ ...artifact, title: artifact.headline, body: artifact.subline }];
  if (artifact.type === "carousel" || artifact.type === "presentation") return artifact.slides;
  return [];
}
export function withArtifactPages(artifact: SimpleArtifact, pages: CopyPage[]): SimpleArtifact {
  if (artifact.type === "story" || artifact.type === "poster" || artifact.type === "post") {
    const { title, body, ...page } = pages[0]; return { ...artifact, ...page, headline: title, subline: body } as SimpleArtifact;
  }
  if (artifact.type === "carousel" || artifact.type === "presentation") return { ...artifact, slides: artifact.slides.map((s, i) => ({ ...s, ...pages[i] })) };
  return artifact;
}
export function artifactCompositionIssues(artifact: SimpleArtifact) { return artifactPages(artifact).flatMap((p, i) => compositionIssues(p).map(issue => `Page ${i + 1}: ${issue}`)); }

export function planArtifactCompositions(artifact: SimpleArtifact, input: unknown, requireResponsive = false, requireRecipes = false) {
  if (!['poster','story','carousel','post','presentation'].includes(artifact.type)) throw new Error('Composition planning is only enabled for active visual formats.');
  const plans=CompositionCandidatesSchema.parse(input), pages=artifactPages(artifact);
  if(artifact.artDirection){
    if(plans.candidates.length!==artifact.artDirection.directions.length)throw Error('Art direction requires three complete candidates.');
    plans.candidates.forEach((candidate,i)=>candidate.pages.forEach((page,j)=>{page.directionId??=artifact.artDirection!.directions[i].id;if(page.directionId!==artifact.artDirection!.directions[i].id)throw Error(`Candidate ${i+1}, page ${j+1}: preserve directionId ${artifact.artDirection!.directions[i].id}.`);}));
  }
  if(requireResponsive&&plans.candidates.some(c=>c.pages.some(p=>!p.responsive)))throw new Error('Every new composition must include responsive layout and visual intent settings.');
  if(requireRecipes&&!pages.some(p=>p.semanticDesign)&&!plans.candidates.some(c=>c.pages.some(p=>p.recipe))){
    for(const[index]of plans.candidates.entries()){
      const page=pages.findIndex((p,i)=>pageCompositionCapabilities(p).recipes.some(id=>i>0||DESIGN_RECIPES.find(r=>r.id===id)?.family!==plans.candidates.find((_,other)=>other!==index)?.pages[0]?.family));
      if(page>=0)throw new Error(`Candidate ${index+1}, page ${page+1}: Use an approved compatible recipe in at least one alternative. Custom compositions may supply the remaining narrative rhythm.`);
    }
    throw new Error('No approved recipe fits the supplied source content and distinct alternatives.');
  }
  const duplicate=plans.candidates.findIndex((c,i)=>plans.candidates.slice(0,i).some(other=>other.pages[0]?.family===c.pages[0]?.family));
  if(duplicate>=0)throw new Error(`Candidate ${duplicate+1}, page 1: The two candidates must have different first-page composition families; each additional candidate must also be distinct.`);
  const candidates=plans.candidates.map(candidate=>{
    const recipeFamilies=new Set(pages.flatMap(p=>pageCompositionCapabilities(p).recipes.map(id=>DESIGN_RECIPES.find(r=>r.id===id)!.family)));
    // A single-page source with only one compatible recipe family needs a custom alternative
    // to retain structural contrast. Requiring that recipe in both would be unsatisfiable.
    if(requireRecipes&&(pages.length>1||recipeFamilies.size>=plans.candidates.length&&pages.some(p=>p.assetId||p.semanticComponent||p.visualContent||/ → |\n/.test(p.body)))&&!candidate.pages.some(p=>p.recipe)){
      const page=Math.max(0,pages.findIndex((p,i)=>i>0&&pageCompositionCapabilities(p).recipes.length));
      throw new Error(`Candidate ${plans.candidates.indexOf(candidate)+1}, page ${page+1}: Each alternative for this multi-page or visual brief must feature an approved compatible recipe; use custom families on other pages for rhythm.`);
    }
    if(candidate.pages.length!==pages.length)throw new Error('Composition planning changed the page count.');
    if(pages.length>=4&&!isConsistentDataSequence(artifact.type==='carousel'||artifact.type==='presentation'?artifact.slides:[])&&new Set(candidate.pages.map(p=>p.family)).size<3){
      const used=new Set(candidate.pages.map(p=>p.family));
      const page=pages.findIndex((p,i)=>i>0&&!candidate.pages[i].recipe&&candidate.pages.filter(other=>other.family===candidate.pages[i].family).length>1&&pageCompositionCapabilities(p).families.some(f=>!used.has(f)));
      if(page>=0)throw new Error(`Candidate ${plans.candidates.indexOf(candidate)+1}, page ${page+1}: This carousel needs at least three purposeful composition families.`);
      throw new Error('This carousel needs at least three purposeful composition families; no source-compatible page can introduce another family.');
    }
    return withArtifactPages(structuredClone(artifact),pages.map((page,i)=>{try{const plan=candidate.pages[i];if(requireResponsive&&plan.responsive){plan.responsive.balance={version:1};plan.responsive.readability={version:1};}return composePage(page,plan);}catch(error){throw new Error(`Candidate ${plans.candidates.indexOf(candidate)+1}, page ${i+1}: ${error instanceof Error?error.message:String(error)}`);}}));
  });
  return {plans,candidates};
}

/** A resolved component editor updates the referenced source field, preserving the stored reference. */
export function editPageComponent(page: CopyPage, component: CopyPage["semanticComponent"]): CopyPage {
  if (!page.composition) return { ...page, semanticComponent: component };
  if (component?.kind !== page.semanticComponent?.kind || component?.items.length !== page.semanticComponent?.items.length) throw new Error("Changing diagram structure requires a new composition plan.");
  let next: CopyPage = { ...structuredClone(page), semanticComponent: structuredClone(component) };
  for (const p of page.composition.placements) if (p.slot.startsWith("semanticComponent.") && isCopyReference(copySource(page, p.slot))) {
    const value = copySource(next, p.slot);
    if (!isCopyReference(value)) next = setCopyText(next, p.copyId, value);
    setSource(next, p.slot, REF + p.copyId);
  }
  return next;
}

export function syncArtifactComposition(before: SimpleArtifact, after: SimpleArtifact): SimpleArtifact {
  const prior = artifactPages(before);
  return withArtifactPages(after, artifactPages(after).map((page, i) => {
    if (!page.composition) return page;
    const old=prior[i]?.composition;
    if(old&&JSON.stringify({version:old.version,blocks:old.blocks,placements:old.placements})!==JSON.stringify({version:page.composition.version,blocks:page.composition.blocks,placements:page.composition.placements}))throw new Error('Direct edits must preserve copy IDs, sources and placement references; use a new composition plan to change structure.');
    if (prior[i]?.composition && JSON.stringify(prior[i].semanticComponent) !== JSON.stringify(page.semanticComponent)) {
      if (JSON.stringify(resolvedComponent(prior[i])) === JSON.stringify(page.semanticComponent)) return { ...page, semanticComponent: prior[i].semanticComponent };
      return editPageComponent({ ...page, semanticComponent: prior[i].semanticComponent }, page.semanticComponent);
    }
    return page;
  }));
}

export function compositionGuide(options:{allowTextFlow?:boolean}={}) {
  const schema=options.allowTextFlow===false?CompositionPlanSchema.extend({responsive:ResponsiveLayoutSchema.extend({visual:ResponsiveLayoutSchema.shape.visual.unwrap().extend({textFlow:z.never().optional()}).default({treatment:'plain',direction:'auto',annotations:[]})}).optional()}):CompositionPlanSchema;
  return `Plan communication BEFORE geometry. Families: oversized-typography (one bold message), asymmetric-editorial (offset columns and deliberate whitespace), image-led (dominant supplied image), diagram-led (native semantic relationship), comparison (two explicit groups), modular-grid (related modules). All adapt to the requested canvas dimensions, including Story safe areas, A4 Poster, portrait Carousel/Post and landscape Presentation. ${responsiveLayoutGuide()} ${typographyGuide()} ${recipeGuide()} Use responsive.visual.textFlow ONLY when planningCapabilities.textFlowModes contains that value; otherwise omit it entirely. This control requires a designed semantic component, not plain text or a preset diagram. Use only actual available assets/components. No fake facts or new diagram labels. bodyMode text preserves the supporting text; sequence/comparison/grid can redistribute existing copy ONLY when it contains a literal separator (supply the exact separator). Sequence uses a native connected timeline. Do not split a sentence into unrelated fragments to force a diagram. Both candidates MUST use the SAME frozen copy, selected assets and page count, with different composition families on the first page; plan carousel rhythm together. For narrative candidates with four or more pages, use at least THREE distinct allowed composition families across the sequence. A series consisting entirely of the same numeric component kind and the same narrative role may retain one coherent family so its data remains comparable. Do not force unrelated structures onto that data series. For other narratives, count the family values explicitly; different alignments, recipes or colors within one family do not satisfy the family rule. The rendered reading structure and phone readability must still pass review. Preserve the provided directionId on every page of its assigned candidate. Never choose image-led without selected artwork, or diagram-led without an existing semantic component, structured visual or explicit sequence. Existing visualContent checklist/process/comparison/example copy is preserved as native editable groups; use bodyMode text to retain that existing structure. Return {candidates:[{pages:[PLAN,...]},{pages:[PLAN,...]}]} with two candidates for legacy requests or three when art direction requests three. PLAN schema: ${JSON.stringify(z.toJSONSchema(schema))}`;
}

/** Page-specific constraints keep a plain closing CTA from acquiring an invented diagram. */
export function pageCompositionCapabilities(page:CopyPage){
  const sequence=/ → | ⟶ |\n/.test(page.body),visual=Boolean(page.assetId||page.semanticComponent||page.visualContent);
  const segmentExisting=sequence&&!page.visualContent&&page.semanticComponent&&['timeline','processLoop','checklist'].includes(page.semanticComponent.kind)&&componentCopySources(page).every(source=>{const value=copySource(page,source);return!value.trim()||isCopyReference(value)||page.body.includes(value);});
  const families=COMPOSITION_FAMILIES.filter(f=>f==='image-led'?Boolean(page.assetId):f==='diagram-led'?Boolean(page.semanticComponent||page.visualContent||sequence):f==='comparison'?page.semanticComponent?.kind==='comparison'||page.visualContent?.kind==='comparison':true);
  const recipes=page.semanticDesign?[]:DESIGN_RECIPES.filter(recipe=>!recipeIssues(page,CompositionPlanSchema.parse({family:recipe.family,recipe:{version:1,id:recipe.id},responsive:{version:1},bodyMode:sequence?'sequence':'text',intent:{goal:'Represent the approved page.',relationship:sequence?'sequence':'statement',reason:'Use only the existing supplied content.'}})).length).map(r=>r.id);
  return {...(page.semanticDesign?{designedComponent:page.semanticDesign.candidateId,allowedArrangements:['stack','auto'],note:'This candidate supplies its own measured native geometry. Keep it full width; do not request a visual recipe or narrow columns.'}:{}),families,recipes,plainVisualOnly:!visual&&!sequence,sequenceFromSuppliedSeparator:sequence,textFlowModes:page.semanticDesign?['regions','grouped'] as const:[],
    bodyModes:page.visualContent?['text'] as const:page.semanticComponent?segmentExisting?['text','sequence'] as const:['text'] as const:sequence?['text','sequence','comparison','grid'] as const:['text'] as const,
    visualDirections:page.visualContent||sequence||!page.assetId&&['checklist','processSteps','hubSpoke'].includes(page.semanticComponent?.kind??'')?['auto','horizontal','vertical'] as const:['auto'] as const};
}
