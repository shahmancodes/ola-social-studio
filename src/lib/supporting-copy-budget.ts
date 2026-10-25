import type { SimpleArtifact } from './simple-content';
import { artifactPages, resolvedComponent, copyText, type CopyPage } from './composition';
import { suppliedPairs } from './supplied-pairs';

/** Exact fields are additional only when the authoritative brief explicitly says so. */
export function supportingCopyBudgetPolicy(brief: string) {
  const range = brief.match(/(\d+)\s*[–−-]\s*(\d+)\s+(?:useful\s+)?supporting\s+words\s+per\s+(?:page|slide|section)/i);
  if (!range) return undefined;
  const pairs = suppliedPairs(brief);
  const introduction = pairs.length ? brief.slice(0, pairs[0].label.start).split(/[.!?\n]/).at(-1) ?? '' : '';
  const additive = /\b(?:also|additionally)\s+(?:include|add|show|present)\b|\bin\s+addition\s+to\b|\balongside\s+(?:the\s+)?(?:supporting\s+)?(?:prose|paragraph|text)\b/i.test(introduction);
  const combined = brief.split(/[.!?\n;]/u).some(clause => /\b(?:count|budget|limit)\b/i.test(clause)
    && /\b(?:prose|supporting(?:\s+(?:copy|words))?)\b/i.test(clause)
    && /\b(?:labels|fields|pairs|component(?:\s+copy)?)\b/i.test(clause)
    && /\b(?:together|combined|total)\b/i.test(clause)
    && !/\b(?:not|never|don't)\b/i.test(clause))
    || /\b(?:word budget|supporting words)[^.!?\n]{0,100}\binclud(?:ing|es)\b[^.!?\n]{0,60}\b(?:labels|fields|pairs|component copy)\b/i.test(brief);
  return {
    min: Number(range[1]), max: Number(range[2]),
    additionalFields: additive && !combined,
    exactFields: pairs.flatMap(pair => [brief.slice(pair.label.start, pair.label.end), brief.slice(pair.detail.start, pair.detail.end)]),
  };
}

/** Share the same interpretation between drafting, focused repair and final validation. */
export function supportingCopyBudgetGuide(brief: string) {
  const policy = supportingCopyBudgetPolicy(brief);
  if (!policy) return '';
  const scope = policy.additionalFields
    ? 'The exact supplied label/detail fields are requested IN ADDITION to the supporting words. Exclude those exact fields from the word budget; they do not replace the required supporting prose. Keep their wording and roles unchanged, and write the requested supporting prose in body/subline without repeating those fields.'
    : 'Count prose AND component prompt, labels, tags and details together. Do not exceed the budget by adding component copy.';
  return `The per-page supporting-word range is ${policy.min}–${policy.max}. ${scope} Headline and closing CTA are excluded.`;
}

export function supportingCopyBudgetChecks(artifact: SimpleArtifact, brief: string) {
  const policy = supportingCopyBudgetPolicy(brief);
  if (!policy) return [];
  const pages: CopyPage[] = artifact.type === 'article' ? artifact.sections : artifactPages(artifact);
  return pages.map((page, i) => {
    let values: string[];
    if (page.composition) {
      // Count visible source identities, including equal wording in independent component cells.
      values = page.composition.blocks.filter(block => !['title', 'cta', 'credit', 'eyebrow', 'semanticComponent.unit'].includes(block.source)
        && page.composition!.placements.some(p => p.copyId === block.id)).map(block => copyText(page, block.id));
    } else {
      const component = resolvedComponent(page);
      const fields = [...(page.visualContent?.items.flatMap(v => [v.label, v.detail]) ?? []), ...(component ? [component.prompt, component.answer, component.leftTitle, component.rightTitle, component.takeaway, component.note, ...component.items.flatMap(v => [v.label, v.detail, v.tag])] : [])].filter((v): v is string => Boolean(v));
      // Composition projects an identical whole body into a component field rather than drawing it twice.
      values = [...(fields.includes(page.body) ? [] : [page.body]), ...fields].filter(v => Boolean(v) && v !== page.title && v !== page.cta);
    }
    // Additional exact fields cannot stand in for the independently requested prose.
    // On composed pages, source JSON alone is insufficient: body must have a visible placement.
    if (policy.additionalFields) values = (!page.composition || page.composition.placements.some(p => p.slot === 'body'))
      && !policy.exactFields.includes(page.body) ? [page.body] : [];
    const words = values.join(' ').trim().split(/\s+/u).filter(Boolean).length;
    const scope = policy.additionalFields ? 'supporting prose, excluding the additional exact fields' : 'prose and component labels';
    const issue = words < policy.min || words > policy.max
      ? `Page ${i + 1}: supporting copy totals ${words} words across ${scope}; required range is ${policy.min}–${policy.max}.`
      : undefined;
    return { page: i + 1, words, min: policy.min, max: policy.max, issue };
  });
}

export function supportingCopyBudgetIssues(artifact: SimpleArtifact, brief: string) {
  return supportingCopyBudgetChecks(artifact, brief).flatMap(check => check.issue ? [check.issue] : []);
}
