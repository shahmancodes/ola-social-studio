export type UsageCall = {
  id: string; model: string; provider: string; stage: string; startedAt: string; durationMs: number;
  outcome: string; inputTokens: number | null; outputTokens: number | null;
  cachedTokens: number | null; reasoningTokens: number | null; costUsd: number | null;
  costSource: string; incomplete: boolean;
};
export type GenerationUsage = {
  id: string; source: 'ola' | 'comparison'; companyId: string | null; companyName: string;
  brief: string; format: string; status: string; createdAt: string; fixture: boolean;
  caseId?: string; engine?: string; version?: number; models: string[]; calls: UsageCall[];
};
export type UsageData = { generations: GenerationUsage[]; updatedAt: string; warnings: string[] };

export function summarizeUsage(generations: GenerationUsage[]) {
  const calls = generations.flatMap(g => g.calls);
  const known = calls.filter(c => c.costUsd !== null);
  return {
    generations: generations.length, calls: calls.length,
    inputTokens: calls.reduce((n, c) => n + (c.inputTokens ?? 0), 0),
    outputTokens: calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0),
    costUsd: known.length ? known.reduce((n, c) => n + c.costUsd!, 0) : null,
    reportedUsd: known.filter(c => c.costSource === 'reported').reduce((n, c) => n + c.costUsd!, 0),
    estimatedUsd: known.filter(c => c.costSource === 'estimated').reduce((n, c) => n + c.costUsd!, 0),
    missingCosts: calls.filter(c => c.costUsd === null).length,
    missingTokens: calls.filter(c => c.inputTokens === null || c.outputTokens === null).length,
    untracked: generations.filter(g => !g.fixture && !g.calls.length).length,
    incomplete: calls.some(c => c.incomplete) || generations.some(g => !g.fixture && !g.calls.length),
    complete: generations.filter(g => g.status === 'complete' || g.status === 'ready' || g.status === 'published').length,
  };
}

export function usageCostLabel(generations: GenerationUsage[]) {
  if (generations.length && generations.every(g => g.fixture)) return 'Fixture · $0';
  const s = summarizeUsage(generations);
  if (s.costUsd === null) return s.calls && generations.some(g => g.calls.some(c => c.costSource === 'pending')) ? 'Pending' : 'Unavailable';
  const qualifier = s.incomplete || s.missingCosts ? 'Partial' : s.estimatedUsd > 0 ? 'Estimated' : 'Reported';
  return `${qualifier} · ${usd(s.costUsd)}`;
}
export function usd(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 4 }).format(value);
}
export const usageDay = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
