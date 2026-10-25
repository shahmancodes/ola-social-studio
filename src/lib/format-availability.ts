import type { ContentType } from "./platform";

export const ACTIVE_FORMATS = ["story", "carousel", "poster"] as const;
export type ActiveFormat = (typeof ACTIVE_FORMATS)[number];
export const COMING_SOON_CODE = "COMING_SOON";
export const COMING_SOON_MESSAGE = "That format is Coming Soon. Ola currently creates Instagram Stories, carousels and posters. Your brief is still here—choose one of those formats to continue.";

export function isActiveFormat(type: string): type is ActiveFormat {
  return type === "story" || type === "carousel" || type === "poster";
}

export function inferRequestedFormat(brief: string): ContentType | null {
  // The lab's frozen format takes precedence over format names in brand metadata.
  const required=[...brief.matchAll(/^Required format:\s*(.+)$/gmi)].at(-1)?.[1];
  const request=required??brief.split(/\n(?:Company|Brand context|Selected assets):/i)[0];
  const formats: Array<[ContentType, RegExp]> = [
    ["carousel", /\b(carousel|carousels|carousell|swipe post|slide post)\b/i],
    ["story", /\b(?:instagram|ig)\s+stor(?:y|ies)\b|\bstor(?:y|ies)\b/i],
    ["poster", /\bposters?\b/i],
  ];
  const explicit=formats.map(([type,pattern])=>({type,index:request.search(pattern)})).filter(m=>m.index>=0).sort((a,b)=>a.index-b.index)[0];
  if(explicit)return explicit.type;
  if (/\b(presentation|slide deck|pitch deck|slides)\b/i.test(brief)) return "presentation";
  if (/\b(article|blog|newsletter)\b/i.test(brief)) return "article";
  if (/\b(post|caption|tweet|thread)\b/i.test(brief)) return "post";
  if (/\b(flyer|certificate|cheque|check|banner|graphic|design)\b/i.test(brief)) return "design";
  return null;
}

export function comingSoonError(type: ContentType | string) {
  return { code: COMING_SOON_CODE, error: `${type.charAt(0).toUpperCase()}${type.slice(1)} is Coming Soon. Ola currently creates Instagram Stories, carousels and posters.` };
}
