import type { ContentType } from "./platform";

export const ACTIVE_FORMATS = ["story", "carousel"] as const;
export type ActiveFormat = (typeof ACTIVE_FORMATS)[number];
export const COMING_SOON_CODE = "COMING_SOON";
export const COMING_SOON_MESSAGE = "That format is Coming Soon. Ola currently creates Instagram Stories and carousels. Your brief is still here—choose one of those formats to continue.";

export function isActiveFormat(type: string): type is ActiveFormat {
  return type === "story" || type === "carousel";
}

export function inferRequestedFormat(brief: string): ContentType | null {
  if (/\b(carousel|carousels|carousell|swipe post|slide post)\b/i.test(brief)) return "carousel";
  if (/\b(?:instagram|ig)\s+stor(?:y|ies)\b|\bstor(?:y|ies)\s+(?:for|on)\s+(?:instagram|ig)\b|\bstor(?:y|ies)\b/i.test(brief)) return "story";
  if (/\b(presentation|slide deck|pitch deck|slides)\b/i.test(brief)) return "presentation";
  if (/\b(article|blog|newsletter)\b/i.test(brief)) return "article";
  if (/\b(post|caption|tweet|thread)\b/i.test(brief)) return "post";
  if (/\b(poster|flyer|certificate|cheque|check|banner|graphic|design)\b/i.test(brief)) return "design";
  return null;
}

export function comingSoonError(type: ContentType | string) {
  return { code: COMING_SOON_CODE, error: `${type.charAt(0).toUpperCase()}${type.slice(1)} is Coming Soon. Ola currently creates Instagram Stories and carousels.` };
}
