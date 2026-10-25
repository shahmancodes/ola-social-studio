import type { ClipAsset } from './schema';
/** Remove setup/tool selection and trailing housekeeping when a clear primary action exists. */
export function actionWindow(clip: ClipAsset) {
  const primary = clip.events.filter(e => ['drag','fill','scroll','select'].includes(e.action));
  const events = primary.length ? primary : clip.events;
  if (!events.length) return { start: 0, end: clip.seconds };
  return { start: Math.max(0, events[0].start - .12), end: Math.min(clip.seconds, events.at(-1)!.end + .65) };
}
