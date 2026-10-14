import { z } from "zod";
import { BrandSchema } from "./platform";

const optionalUrl = z.union([z.literal(""), z.url().refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL.")]);

export const OnboardingBrandSchema = BrandSchema.extend({
  description: z.string().trim().max(3000),
  website: optionalUrl,
  audience: z.string().trim().max(2000),
  voice: z.string().trim().max(2000),
  formatRules: z.string().trim().max(2000),
  examples: z.array(z.string().trim().max(500)).max(20),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(12),
  socialLinks: z.array(z.object({ label: z.string().trim().min(1).max(80), url: optionalUrl.refine(Boolean, "Add a URL for every link.") })).max(20),
});

export function parseCompanyName(input: unknown) {
  return z.string().trim().min(1, "Enter a company name.").max(120).parse(input);
}
