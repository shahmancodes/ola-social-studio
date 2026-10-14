/** Conservative placement guide for a static 1080 × 1920 Instagram Story. */
export const STORY_SAFE_AREA = { width: 1080, height: 1920, top: 270, bottom: 1536, side: 54 } as const;

export function storyTextIsSafe(box: { x: number; y: number; w: number; h: number }) {
  return box.x >= STORY_SAFE_AREA.side && box.x + box.w <= STORY_SAFE_AREA.width - STORY_SAFE_AREA.side && box.y >= STORY_SAFE_AREA.top && box.y + box.h <= STORY_SAFE_AREA.bottom;
}
