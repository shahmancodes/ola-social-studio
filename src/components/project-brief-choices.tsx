import { CREATIVE_FORMATS } from "@/lib/creative-brief";
import { isActiveFormat } from "@/lib/format-availability";

export function ProjectBriefChoices({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;
  const choices = data as Record<string, unknown>;
  const rows = [
    ["Format", typeof choices.format === "string" && isActiveFormat(choices.format) ? CREATIVE_FORMATS[choices.format].label + (choices.format === "carousel" && typeof choices.slideCount === "number" ? ` · ${choices.slideCount} slides` : "") : ""],
    ["Audience", typeof choices.audience === "string" ? choices.audience : ""],
    ["Tone", typeof choices.tone === "string" ? choices.tone : ""],
    ["References", Array.isArray(choices.references) ? choices.references.filter(value => typeof value === "string").join(", ") : ""],
  ].filter(([, value]) => value);
  if (!rows.length) return null;
  return <dl className="mb-4 grid gap-1.5 rounded-lg border bg-muted/25 p-3 text-[11px] leading-5" aria-label="Your creative choices">{rows.map(([label, value]) => <div key={label} className="flex min-w-0 gap-2"><dt className="w-16 shrink-0 font-medium text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl>;
}
