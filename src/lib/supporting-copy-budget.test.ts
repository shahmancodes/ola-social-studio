import { describe, expect, it } from 'vitest';
import { SimpleArtifactSchema } from './simple-content';
import { artifactPages, composePage, withArtifactPages } from './composition';
import { supportingCopyBudgetChecks, supportingCopyBudgetGuide, supportingCopyBudgetIssues, supportingCopyBudgetPolicy } from './supporting-copy-budget';

const pairs = '"Observation" / "What does the source actually show?"; "Uncertainty" / "What remains unconfirmed?"; "Next check" / "What evidence would help?"';
const brief = `Write 12–18 useful supporting words per page. On page 2 also include exactly these three label/detail pairs: ${pairs}.`;
const body = 'Separate what the evidence supports from what still needs checking before drawing a conclusion.';
const fixture = (prose = '') => SimpleArtifactSchema.parse({ type: 'poster', headline: 'Notice the limits', subline: prose, visualContent: { kind: 'example', items: [
  { label: 'Observation', detail: 'What does the source actually show?' },
  { label: 'Uncertainty', detail: 'What remains unconfirmed?' },
  { label: 'Next check', detail: 'What evidence would help?' },
] } });
const composed = (artifact: ReturnType<typeof fixture>) => withArtifactPages(artifact, artifactPages(artifact).map(page => composePage(page, { family: 'modular-grid', bodyMode: 'text', intent: { goal: 'Read independent fields', relationship: 'statement', reason: 'Separate supporting prose and equal fields.' }, responsive: { version: 1 } })));

describe('supporting words alongside supplied fields', () => {
  it('detects the real missing-paragraph failure before and after composition', () => {
    for (const artifact of [fixture(), composed(fixture())]) {
      expect(supportingCopyBudgetChecks(artifact, brief)[0].words).toBe(0);
      expect(supportingCopyBudgetIssues(artifact, brief)[0]).toContain('required range is 12–18');
    }
  });
  it('accepts a requested paragraph plus exact fields without shrinking or rewriting either', () => {
    for (const artifact of [fixture(body), composed(fixture(body))]) {
      expect(supportingCopyBudgetChecks(artifact, brief)[0].words).toBe(14);
      expect(supportingCopyBudgetIssues(artifact, brief)).toEqual([]);
    }
  });
  it('does not count newly stored but unplaced prose as visible supporting copy', () => {
    const artifact = composed(fixture());
    if (artifact.type === 'poster') artifact.subline = body;
    expect(supportingCopyBudgetChecks(artifact, brief)[0].words).toBe(0);
  });
  it('retains combined budgets when fields are not explicitly additional', () => {
    const combined = brief.replace('also include', 'include');
    expect(supportingCopyBudgetPolicy(combined)?.additionalFields).toBe(false);
    expect(supportingCopyBudgetChecks(fixture(), combined)[0].words).toBe(17);
    expect(supportingCopyBudgetIssues(fixture(), combined)).toEqual([]);
    expect(supportingCopyBudgetChecks(fixture(body), combined)[0].words).toBe(31);
  });
  it('respects an explicit total even when a list is introduced with also', () => {
    const total = `${brief} Count prose and component labels together in the total.`;
    expect(supportingCopyBudgetPolicy(total)?.additionalFields).toBe(false);
    expect(supportingCopyBudgetChecks(fixture(), total)[0].words).toBe(17);
  });
  it.each(['additionally include', 'show in addition to the prose', 'present alongside the prose'])('recognizes an explicit additive instruction: %s', instruction => {
    expect(supportingCopyBudgetPolicy(brief.replace('also include', instruction))?.additionalFields).toBe(true);
  });
  it('does not let an unrelated page total override the prose scope', () => {
    expect(supportingCopyBudgetPolicy(`${brief} Count three pages in total.`)?.additionalFields).toBe(true);
  });
  it('does not infer a scope change from an unrelated also instruction', () => {
    const other = `Also use the saved logo. ${brief.replace('also include', 'include')}`;
    expect(supportingCopyBudgetPolicy(other)?.additionalFields).toBe(false);
  });
  it('shares an unambiguous guide without inventing a budget for unquantified briefs', () => {
    expect(supportingCopyBudgetGuide(brief)).toContain('do not replace the required supporting prose');
    expect(supportingCopyBudgetGuide('Create a useful poster.')).toBe('');
    expect(supportingCopyBudgetIssues(fixture(), 'Create a useful poster.')).toEqual([]);
  });
});
