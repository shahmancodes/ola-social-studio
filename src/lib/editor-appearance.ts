import { z } from "zod";
import { EDITOR_FONT_IDS, fontFamily } from "./font-catalog";
import { TextTypographySchema } from './design-typography';
import { FreeformCanvasSchema } from './freeform-canvas';

export const TextAppearanceSchema = z.object({
  box: TextTypographySchema.shape.box,
  font: z.enum(EDITOR_FONT_IDS).optional(),
  fontId: z.string().max(120).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  fontSize: z.number().min(12).max(180).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  leading: z.number().min(.95).max(1.65).optional(),
  tracking: z.number().min(-.06).max(.16).optional(),
  breakAfter: TextTypographySchema.shape.breakAfter,
  emphasis: TextTypographySchema.shape.emphasis,
});
export const EditorAppearanceSchema = z.object({
  freeform: FreeformCanvasSchema.optional(),
  text: z.record(z.string().max(160), TextAppearanceSchema).optional(),
  image: z.object({
    crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(.1).max(1), height: z.number().min(.1).max(1) }).refine(v => v.x + v.width <= 1.00001 && v.y + v.height <= 1.00001, "The crop must stay inside the image.").optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
  }).optional(),
});
export type EditorAppearance = z.infer<typeof EditorAppearanceSchema>;
export type TextAppearance = z.infer<typeof TextAppearanceSchema>;
export const editorFontFamily = fontFamily;
