/** The same defaults are used by modelFor(), worker snapshots, and Sentinel. */
export function defaultModelSettings(env: Readonly<Record<string, string | undefined>> = process.env) {
  const openrouter = env.OPENROUTER_MODEL || 'qwen/qwen3.6-35b-a3b';
  return {
    vercel: { configured: Boolean(env.AI_GATEWAY_API_KEY), model: env.VERCEL_AI_MODEL || 'openai/gpt-6-luna' },
    openrouter: { configured: Boolean(env.OPENROUTER_API_KEY), model: openrouter, visionModel: env.OPENROUTER_VISION_MODEL || openrouter },
  };
}
export type ModelSettings = ReturnType<typeof defaultModelSettings>;

export const PIPELINE_AGENTS = [
  { id: 'coordinator', name: 'Intake coordinator', purpose: 'Routes the request, clarifies the brief, and decides what research is needed.', routing: 'text' },
  { id: 'specialists', name: 'Content specialists', purpose: 'Poster, post, Story, carousel, article, and presentation brief preparation.', routing: 'text' },
  { id: 'research', name: 'Research agents', purpose: 'Fact checking, visual reference research, and artwork discovery with web search.', routing: 'text' },
  { id: 'director', name: 'Creative director', purpose: 'Plans visual directions from the brief, brand memory, and reference images.', routing: 'mixed' },
  { id: 'copy', name: 'Copy & representation planner', purpose: 'Plans content structure and writes the canonical copy.', routing: 'text' },
  { id: 'composition', name: 'Composition planner', purpose: 'Creates candidate layouts, typography, and responsive compositions.', routing: 'mixed' },
  { id: 'review', name: 'Visual reviewer & repair agent', purpose: 'Inspects rendered candidates, selects a direction, and repairs quality issues.', routing: 'vision' },
  { id: 'semantic', name: 'Semantic component designer', purpose: 'Assesses component gaps, designs alternatives, and reviews their rendered output.', routing: 'mixed' },
  { id: 'freeform', name: 'Freeform design agent', purpose: 'Clarifies custom design requests and generates editable layouts.', routing: 'mixed' },
  { id: 'editing', name: 'Ola editing agent', purpose: 'Applies conversational edits, including edits informed by page images.', routing: 'mixed' },
  { id: 'brand', name: 'Brand analysis agent', purpose: 'Extracts brand context and design rules from public website evidence.', routing: 'text' },
] as const;
