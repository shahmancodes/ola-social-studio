export const VISUAL_LAYOUTS = ["hero", "split", "steps", "statement", "diagram", "closing"] as const;
export type VisualLayout = typeof VISUAL_LAYOUTS[number];
