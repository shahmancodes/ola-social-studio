import { z } from "zod";

export const CREATIVE_FORMATS = {
  story: { label: "Instagram Story", detail: "1080 × 1920 px · 1 image" },
  carousel: { label: "Carousel", detail: "1080 × 1350 px · 3–9 slides" },
  poster: { label: "Poster", detail: "A4 portrait · 1240 × 1754 px" },
} as const;

export const CreativeBriefSchema = z.object({
  companyId: z.string().uuid(),
  brief: z.string().trim().min(3).max(5000),
  format: z.enum(["story", "carousel", "poster"]).optional(),
  slideCount: z.number().int().min(3).max(9).optional(),
  audience: z.string().trim().max(2000).optional(),
  tone: z.string().trim().max(2000).optional(),
});
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

/** Keep the user's copy intact; separate explicit form choices from the source brief. */
export function guidedBrief(input: CreativeBrief) {
  const choices = [
    input.format && `Required format: ${CREATIVE_FORMATS[input.format].label}`,
    input.format === "carousel" && input.slideCount && `Number of slides: ${input.slideCount}`,
    input.format === "poster" && "Canvas: A4 portrait, 1240 × 1754 px",
    input.audience && `Audience: ${input.audience}`,
    input.tone && `Tone: ${input.tone}`,
  ].filter(Boolean);
  return input.brief + (choices.length ? `\n\nCreative choices:\n${choices.join("\n")}` : "");
}

export const REFERENCE_LIMIT = 4;
export const REFERENCE_MAX_BYTES = 10_000_000;
