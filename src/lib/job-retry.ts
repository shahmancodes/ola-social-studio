export const MAX_JOB_ATTEMPTS = 3;
const retryableJobs = new Set(["intake-route", "generate-simple", "resume-composition", "review-simple", "design-clarify", "design-generate", "review-design"]);
const settledStatuses = new Set(["stopped", "complete", "needs-review", "awaiting-input", "coming-soon"]);

/** Retry generated-output validation and temporary provider failures, with a finite budget. */
export function jobRetryDelay(kind: string, error: unknown, attempts: number, projectStatus: string): number | null {
  if (!retryableJobs.has(kind) || attempts >= MAX_JOB_ATTEMPTS || settledStatuses.has(projectStatus)) return null;
  const message = error instanceof Error ? error.message : String(error);
  // A publisher's 403 is a recoverable citation failure, not an AI credential failure.
  if (message.startsWith("Evidence source check failed:")) return Math.min(2_000 * 4 ** Math.max(0, attempts - 1), 30_000);
  if (/not configured|no AI provider|set AI_GATEWAY_API_KEY|add AI_GATEWAY_API_KEY|cancelled|canceled|stopped|access denied|unauthorized|forbidden|invalid api.?key|insufficient (?:credits|funds)|payment required|\b(?:401|402|403)\b/i.test(message)) return null;
  const status = error && typeof error === "object" ? (error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status : undefined;
  const temporary = status === 408 || status === 429 || status !== undefined && status >= 500 && status <= 599
    || /\b(?:408|429|50[0-9]|51[0-1])\b|rate.?limit|overloaded|temporar(?:y|ily)|timed? ?out|timeout|deadline exceeded|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message);
  const generatedOutput = error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")
    || /Generated component copy repair failed|Copy repair rejected|Copy review failed before composition|Evidence source check failed|Representation (?:draft|planning) failed|Composition planning failed|Art direction planning failed|Visual selector|No candidate passed rendering|Designed component violated the source contract|Creative planning did not produce|Research (?:agent did not use|did not return)|Design intake did not return|Expected exactly \d+ slides; generated|Text does not fit|Content (?:cannot fit|exceeds the readable layout capacity)/i.test(message);
  return temporary || generatedOutput ? Math.min(2_000 * 4 ** Math.max(0, attempts - 1), 30_000) : null;
}
