import { z } from 'zod';

export const FrameSchema = z.enum(['landscape', 'portrait', 'square']);
const short = (max: number) => z.string().trim().min(1).max(max);
const point = z.object({ x: z.number().min(0).max(1439), y: z.number().min(0).max(999) });
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('drag'), from: point, to: point }),
  z.object({ type: z.literal('click'), selector: short(2000) }),
  z.object({ type: z.literal('select'), selector: short(2000), value: z.string().max(200) }),
  z.object({ type: z.literal('fill'), selector: short(2000), value: z.string().max(500) }),
  z.object({ type: z.literal('press'), selector: short(2000), key: z.enum(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp']) }),
  z.object({ type: z.literal('scroll'), y: z.number().int().min(0).max(12000) }),
]);
export const CaptureStepSchema = z.object({
  label: short(70), url: z.string().url().max(2000).optional(),
  selector: short(2000).optional(), actions: z.array(ActionSchema).max(24).default([]),
});
export const VideoInputSchema = z.object({
  url: z.string().url().max(2000), feature: short(500), brand: z.string().trim().max(40).default(''),
  format: FrameSchema.default('landscape'), theme: z.enum(['light', 'dark']).default('light'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b5cf6'),
  cta: short(60).default('Try it for yourself.'),
  steps: z.array(CaptureStepSchema).max(6).default([]),
}).transform(input => ({ ...input, brand: input.brand || new URL(input.url).hostname.replace(/^www\./, '').split('.')[0].slice(0, 40) }));
export const SceneSchema = z.object({
  id: short(80), kind: z.enum(['title', 'showcase', 'focus', 'split', 'cta', 'intertitle', 'clip', 'detail']),
  headline: short(90), caption: z.string().max(160).default(''),
  seconds: z.number().min(2).max(10), assetId: z.string().max(80).optional(),
  clipId: short(80).optional(), clipStart: z.number().min(0).max(60).default(0), clipEnd: z.number().min(.1).max(60).optional(), playbackRate: z.number().min(.5).max(2).default(1),
  emphasis: z.string().max(40).default(''), purpose: z.string().max(240).default(''),
  camera: z.enum(['still', 'push', 'pull']).default('still'),
  focusX: z.number().min(0).max(1).default(.5), focusY: z.number().min(0).max(1).default(.5),
  zoom: z.number().min(1).max(2.5).default(1.12),
});
export const MusicSelectionSchema = z.object({ trackId: short(50), volume: z.number().min(0).max(1).default(.3) });
export const MusicRequestSchema = z.union([MusicSelectionSchema, z.object({ mode: z.literal('auto'), brief: z.string().trim().max(300).default(''), volume: z.number().min(0).max(1).default(.3) })]);
export const StoryboardSchema = z.object({
  treatment: z.enum(['classic', 'editorial']).default('classic'),
  music: MusicSelectionSchema.optional(),
  brand: short(40), format: FrameSchema, theme: z.enum(['light', 'dark']),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), scenes: z.array(SceneSchema).min(3).max(12),
});
export type VideoInput = z.infer<typeof VideoInputSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type CaptureAsset = { id: string; file: string; url: string; title: string; label: string; selector?: string; width: number; height: number; sha256: string; capturedAt: string; take?: boolean };
export type ClipAsset = { id: string; file: string; label: string; width: number; height: number; seconds: number; fps: number; sha256: string; startAssetId: string; endAssetId: string; actionCount: number; focus: { x: number; y: number; width: number; height: number }; events: { action: string; start: number; end: number }[] };
export type DirectionReport = { method: 'ai' | 'evidence-template'; summary: string; warnings: string[] };
export type VideoStatus = 'queued' | 'capturing' | 'draft' | 'render_queued' | 'rendering' | 'ready' | 'failed' | 'login_required' | 'music_queued' | 'scoring';
export type VideoRecord = { id: string; companyId: string; input: VideoInput; status: VideoStatus; progress: number; message: string; error?: string; assets: CaptureAsset[]; clips?: ClipAsset[]; direction?: DirectionReport; storyboard?: Storyboard; warnings: string[]; music?: import('./music-catalog').PreparedMusic; musicRequest?: z.infer<typeof MusicRequestSchema>; login?: { url: string; origin: string }; recording?: { file: string; seconds: number }; discovery?: import('./discovery').DiscoveryReport; revision: number; renderedRevision?: number; createdAt: string; updatedAt: string };
export const FPS = 30;
export function dimensions(format: Storyboard['format']) { return format === 'portrait' ? { width: 1080, height: 1920 } : format === 'square' ? { width: 1080, height: 1080 } : { width: 1920, height: 1080 }; }
export function duration(storyboard: Storyboard) { return storyboard.scenes.reduce((sum, scene) => sum + Math.round(scene.seconds * FPS), 0); }
export function storyboardFromCaptures(input: VideoInput, assets: CaptureAsset[]): Storyboard {
  if (!assets.length) throw new Error('No usable screenshots were captured.');
  return StoryboardSchema.parse({ ...input, scenes: [
    { id: 'intro', kind: 'title', headline: input.feature.slice(0, 90), caption: input.brand, seconds: 3, assetId: assets[0].id },
    ...assets.map((asset, index) => ({ id: `scene-${index + 1}`, kind: index % 3 === 0 ? 'showcase' : index % 3 === 1 ? 'focus' : 'split', headline: asset.label.slice(0, 90), caption: new URL(asset.url).hostname, seconds: 5, assetId: asset.id, zoom: index % 3 === 1 ? 1.65 : 1.08 })),
    { id: 'outro', kind: 'cta', headline: input.cta, caption: new URL(input.url).hostname, seconds: 3 },
  ] });
}
export function validateStoryboardAssets(storyboard: Storyboard, assets: CaptureAsset[], clips: ClipAsset[] = []) {
  const ids = new Set(assets.map(a => a.id));
  if (new Set(storyboard.scenes.map(s => s.id)).size !== storyboard.scenes.length) throw new Error('Scene IDs must be unique.');
  for (const scene of storyboard.scenes) {
    if (scene.assetId && !ids.has(scene.assetId)) throw new Error('Scene refers to an unavailable capture.');
    if (scene.clipId) {
      const clip = clips.find(c => c.id === scene.clipId);
      if (!clip) throw new Error('Scene refers to an unavailable clip.');
      if (scene.clipEnd === undefined) throw new Error('Set an explicit clip trim end.');
      const end = scene.clipEnd;
      if ((end - scene.clipStart) / scene.playbackRate > 10) throw new Error('Keep the edited clip below ten seconds or increase its speed.');
      if (scene.clipStart >= end || end > clip.seconds + .001) throw new Error('Clip trim is outside the recorded take.');
    }
    if (scene.kind === 'clip' && !scene.clipId) throw new Error('Action scenes need a recorded clip.');
    if (['showcase', 'focus', 'split', 'detail'].includes(scene.kind) && !scene.assetId) throw new Error('Product scenes need a capture.');
  }
}
