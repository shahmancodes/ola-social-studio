import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { artifactPages } from './composition';
import { approvedArtwork, readArtworkEvidence } from './directed-artwork';
import { evidenceExcerpt } from './evidence-excerpts';
import type { SimpleArtifact } from './simple-content';

/** A photo credit needs its image's evidence, even when the message needs no factual research. */
export async function artworkCreditEvidence(artifact: SimpleArtifact, reopen = readArtworkEvidence) {
  const placed = new Set(artifactPages(artifact).flatMap(page => [page.assetId, ...(page.supportingAssetIds ?? [])].filter(Boolean)));
  const selected = (artifact.artwork ?? []).filter(item => item.assetId && placed.has(item.assetId));
  const issues: string[] = [];
  const evidence: Array<{ assetId: string; title: string; attribution: string; rights: string; origin: 'acquisition-review' | 'reopened'; checkedAt?: string; sources: Array<{ url: string; text: string }> }> = [];
  for (const item of selected) {
    if (!approvedArtwork(item)) { issues.push(`Selected acquired artwork ${item.assetId} has not passed independent source and rights review.`); continue; }
    try {
      const bytes = await fs.readFile(item.localPath!);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (item.sha256 && sha256 !== item.sha256) throw Error('The approved image bytes have changed.');
      const saved = item.acquisitionEvidence;
      if (saved && (saved.sha256 !== sha256 || saved.sourcePageUrl !== item.sourcePageUrl || saved.assetUrl !== item.assetUrl || saved.rightsUrl !== item.rightsUrl || saved.attribution !== item.attribution)) throw Error('The saved acquisition evidence no longer matches the selected image or credit.');
      // Old saved outputs have no captured evidence. Reopen their sources instead of trusting a rights assertion.
      const sources = saved?.sources ?? await Promise.all([...new Set([item.sourcePageUrl, item.rightsUrl].filter((url): url is string => Boolean(url)))].map(async url => {
        const page = await reopen(url);
        return { url: page.url, text: evidenceExcerpt(page.text, item.title + ' ' + item.attribution + ' ' + item.rights, 'creator licence attribution reuse', 10000) };
      }));
      evidence.push({ assetId: item.assetId!, title: item.title, attribution: item.attribution, rights: item.rights, origin: saved ? 'acquisition-review' : 'reopened', checkedAt: saved?.checkedAt, sources });
    } catch (error) {
      if (error instanceof ReferenceError || error instanceof SyntaxError) throw error;
      issues.push(`Could not verify acquired artwork credit ${item.assetId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { evidence, issues };
}
