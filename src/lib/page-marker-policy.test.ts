import { expect, it } from 'vitest';
import { pageMarkersAllowed } from './page-marker';
import { artifactPages, composePage } from './composition';
import { enforceBriefScope, applyArtifactPatches } from './artifact-repair';
import { SimpleArtifactSchema } from './simple-content';
import { buildVisualScene } from './content-layout';
import type { ContentBrand } from './content-brand';

it('honors exact-copy restrictions and explicit pagination instructions', () => {
  expect(pageMarkersAllowed('Add no other visible labels or unrequested text.')).toBe(false);
  expect(pageMarkersAllowed('Avoid extra text.')).toBe(false);
  expect(pageMarkersAllowed('Do not show page numbers.')).toBe(false);
  expect(pageMarkersAllowed('Add no other visible labels. Include page numbers.')).toBe(true);
  expect(pageMarkersAllowed('Create a useful carousel.')).toBe(true);
  expect(pageMarkersAllowed('Required headline: "No extra text". Create a useful carousel.')).toBe(true);
});

const plan = { family: 'asymmetric-editorial', intent: { goal: 'Give the reader clear hierarchy', relationship: 'statement', reason: 'Keep supporting prose directly below the headline.' }, responsive: { version: 1, balance: { version: 1 }, readability: { version: 1 } } };
const source = SimpleArtifactSchema.parse({ type: 'carousel', title: 'Guide', caption: '', slides: Array.from({ length: 3 }, (_, i) => ({ id: `page-${i + 1}`, ...composePage({ title: 'One useful idea', body: 'Keep the source visible while checking its limits.' }, plan) })) });
const brand: ContentBrand = { companyId: 'test', name: 'Example', audience: '', voice: '', description: '', typography: '', imagery: '', formatRules: '', examples: [], assets: [], palette: { background: '#FFFFFF', alternate: '#EEEEEE', ink: '#111111', dark: '#111111', accent: '#164DA8' } };

it.each(['carousel', 'presentation', 'story', 'post', 'poster'] as const)('removes only pagination chrome in the shared %s renderer', async format => {
  const scoped = enforceBriefScope(source, 'Add no other visible labels or unrequested text.');
  const before = await buildVisualScene(format, artifactPages(source)[1], brand, 1, 3);
  const after = await buildVisualScene(format, artifactPages(scoped)[1], brand, 1, 3);
  const marker = (id?: string) => id?.startsWith('page-marker');
  expect(before.elements.filter(e => marker(e.id))).toHaveLength(2);
  expect(after.elements.filter(e => marker(e.id))).toHaveLength(0);
  expect(after.elements).toEqual(before.elements.filter(e => !marker(e.id)));
  expect(artifactPages(scoped).map(p => [p.title, p.body])).toEqual(artifactPages(source).map(p => [p.title, p.body]));
  const reset = applyArtifactPatches(scoped, { reason: 'Restore requested navigation', patches: [{ target: 'page-2', responsive: { pageMarker: null } }] }, 'Include page numbers.');
  const restored = await buildVisualScene(format, artifactPages(reset)[1], brand, 1, 3);
  expect(restored.elements).toEqual(before.elements);
});

it('preserves existing pagination choices on unrestricted or explicitly paginated briefs', () => {
  expect(enforceBriefScope(source, 'Create a useful guide.')).toEqual(source);
  expect(enforceBriefScope(source, 'Add no other visible labels. Include page numbers.')).toEqual(source);
});
