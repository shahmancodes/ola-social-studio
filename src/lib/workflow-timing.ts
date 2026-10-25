import type { WorkflowEvent } from "./workflow-state";

type TimingInput = { events: WorkflowEvent[]; status: string; createdAt?: string; updatedAt?: string };
const timestamp = (value?: string) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
export function secondsLabel(seconds: number) { return `${Math.max(0, Math.floor(seconds))}s`; }

function eventStep(event: WorkflowEvent): number | null {
  if (event.actor === "qa" || event.kind === "review-started") return 3;
  if (event.actor !== "agent") return null;
  if (event.stage === "research" && event.kind !== "research-plan" || event.stage === "visual-reference") return 1;
  if (["intake", "orchestrator"].includes(event.stage)) return null;
  return /qa|review|quality/.test(event.stage) ? 3 : 2;
}

/** Elapsed phase time for the initial draft, including queue time and excluding answer waits. */
export function workflowTiming(input: TimingInput, nowMs: number) {
  const events = input.events.flatMap(event => {
    const time = timestamp(event.createdAt);
    return time === null ? [] : [{ event, time }];
  });
  const start = timestamp(input.createdAt) ?? events[0]?.time;
  const steps: Array<number | null> = [null, null, null, null];
  if (start === undefined || start === null) return { totalSeconds: null, steps };
  let cursor = start, phase = 0, paused = false, finished = false;
  const stoppedAt = ["stopped", "failed", "awaiting-input", "coming-soon"].includes(input.status) ? timestamp(input.updatedAt) : null;
  const milliseconds = [0, 0, 0, 0];
  steps[0] = 0;
  function accumulate(until: number) {
    const end = Math.max(cursor, until);
    if (!paused) milliseconds[phase] += end - cursor;
    cursor = end;
  }
  for (const { event, time } of events) {
    if (stoppedAt !== null && time > stoppedAt) { accumulate(stoppedAt); finished = true; break; }
    accumulate(time);
    if (event.actor === "assistant" && ["complete", "quality", "coming-soon"].includes(event.kind)) { finished = true; break; }
    if (event.actor === "assistant" && event.kind === "question") paused = true;
    if (event.actor === "user" && ["answer", "retry"].includes(event.kind)) paused = false;
    const next = eventStep(event);
    if (event.stage === "research" && event.kind === "source" && steps[1] === null) continue;
    if (!paused && next !== null) { phase = next; steps[phase] = 0; }
  }
  if (!finished) {
    if (["complete", "needs-review"].includes(input.status)) return { totalSeconds: null, steps: [null, null, null, null] };
    const active = ["queued", "routing", "clarifying", "generating", "researching", "storyboarding", "rendering", "qa", "draft"].includes(input.status);
    accumulate(active ? Math.max(cursor, nowMs) : timestamp(input.updatedAt) ?? cursor);
  }
  return { totalSeconds: Math.floor(milliseconds.reduce((sum, value) => sum + value, 0) / 1000), steps: steps.map((value, index) => value === null ? null : Math.floor(milliseconds[index] / 1000)) };
}
