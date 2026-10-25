import { z } from 'zod';
import type { SimpleArtifact } from './simple-content';
import { artifactPages, withArtifactPages, copySource, componentCopySources, visualCopySources, type CopyPage } from './composition';
import { supportingCopyBudgetChecks, supportingCopyBudgetGuide } from './supporting-copy-budget';
import { representationCopyPolicy } from './content-representation';

/** Repair generated copy before approval; exact supplied fields never become editable. */
export async function repairSupportingBudgets(input: SimpleArtifact, brief: string, ask: (prompt: string) => Promise<string>, record?: (data: unknown) => void) {
  let artifact = structuredClone(input);
  const pages = artifact.type === 'article' ? artifact.sections as CopyPage[] : artifactPages(artifact);
  const exact = representationCopyPolicy(brief).exactCopyRefs.map(ref => brief.slice(ref.start, ref.end));
  for (let i = 0; i < pages.length; i++) {
    for (let pass = 0; pass < 2; pass++) {
      const check = supportingCopyBudgetChecks(artifact, brief)[i];
      if (!check?.issue) break;
      const page = pages[i];
      const sources = ['body', ...componentCopySources(page), ...visualCopySources(page)].filter(source => {
        const value = copySource(page, source);
        // Do not rewrite quoted wording embedded in a longer field, either.
        if (exact.some(text => text && value.includes(text))) return false;
        if (value.trim()) return !value.startsWith('@copy:');
        // A missing requested paragraph is repairable before composition. Never add invisible copy.
        return source === 'body' && check.words < check.min && (!page.composition || page.composition.placements.some(p => p.slot === 'body'));
      });
      if (!sources.length) throw Error('The supporting-word budget conflicts with exact supplied copy or has no visible editable supporting field.');
      const schema = z.object({ edits: z.array(z.object({ source: z.enum(sources as [string, ...string[]]), value: z.string().max(300) }).strict()).min(1).max(20) }).strict();
      const prompt = `Repair only the GENERATED supporting copy on page ${i + 1} before copy approval. ${check.issue} ${supportingCopyBudgetGuide(brief)} Leave a safety margin below the maximum. Preserve the representation, exact supplied wording, facts, numbers and relation meanings. An empty body in the allowlist may receive the missing requested supporting prose. Do not drop an essential stage or change source fields outside the allowlist. No whole-artifact rewrite. Return JSON DATA matching ${JSON.stringify(z.toJSONSchema(schema))}, not the schema itself. Editable canonical fields: ${JSON.stringify(Object.fromEntries(sources.map(source => [source, copySource(page, source)])))}. Page context: ${JSON.stringify(page)}. Authoritative brief: ${brief}`;
      const raw = await ask(prompt);
      const result = schema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')));
      if (new Set(result.edits.map(edit => edit.source)).size !== result.edits.length) throw Error('Duplicate budget edit.');
      const next = structuredClone(page);
      for (const edit of result.edits) {
        const keys = edit.source.split('.');
        let node: unknown = next;
        for (const key of keys.slice(0, -1)) node = (node as Record<string, unknown>)[key];
        (node as Record<string, unknown>)[keys.at(-1)!] = edit.value;
      }
      pages[i] = next;
      artifact = artifact.type === 'article' ? { ...artifact, sections: artifact.sections.map((section, j) => ({ ...section, ...pages[j] })) } : withArtifactPages(artifact, pages);
      record?.({ page: i + 1, pass, issues: [check.issue], edits: result.edits });
    }
  }
  return artifact;
}
