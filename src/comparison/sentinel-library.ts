import fs from 'node:fs';
import path from 'node:path';
import { SEMANTIC_COMPONENT_CHOICES, createSemanticComponent } from '../lib/semantic-component-presets';
import { DESIGN_RECIPES } from '../lib/design-recipes';
import { TEXTBOX_PRESETS } from '../lib/textbox-style';
import { OTHER_FONTS } from '../lib/font-catalog';
import { curatedTemplates, templateSources } from './template-catalog';
import { sourceCatalog } from './inputs';
import { LAB_DIR } from './config';
import { semanticComponentHtml } from '../lib/semantic-components';

export function sentinelLibrary() {
  return {
    components: SEMANTIC_COMPONENT_CHOICES.map(c => { const example = createSemanticComponent(c.kind); return { ...c, example, previewHtml: semanticComponentHtml(example) }; }),
    recipes: DESIGN_RECIPES.map(r => ({ ...r, previews: Object.fromEntries(['poster', 'story', 'carousel'].filter(f => fs.existsSync(path.join(LAB_DIR, 'recipe-variants', `${r.id}-${f}.png`))).map(f => [f, `/api/recipe-variant-file/${r.id}-${f}`])) })),
    templates: curatedTemplates.map(t => ({ ...t, sourceInfo: templateSources[t.source], preview: fs.existsSync(path.join(LAB_DIR, 'template-curation', 'previews', `${t.id}.png`)) && fs.existsSync(path.join(LAB_DIR, 'template-curation', 'manifest.json')) ? `/api/template-preview-file/${t.id}` : null })),
    textboxes: TEXTBOX_PRESETS.map(p => ({ ...p, previewUrl: `/textbox-presets?preset=${p.id}` })),
    fonts: OTHER_FONTS.map(f => ({ id: f.id, label: f.label, family: f.family, bundled: 'package' in f })),
    companies: sourceCatalog().map(c => ({ ...c, assets: c.assets as Array<{ id: string; name: string; media_type: string; category: string }> })),
  };
}
export type SentinelLibrary = ReturnType<typeof sentinelLibrary>;
