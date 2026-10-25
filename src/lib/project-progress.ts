import type { WorkflowEvent } from "./workflow-state";

export const PROJECT_STEPS = ["Understanding your brief", "Checking sources", "Designing", "Reviewing"] as const;
export function projectProgress(status: string, events: WorkflowEvent[]) {
  if (["complete", "needs-review"].includes(status)) return { index: 3, label: status === "complete" ? "Your draft is ready" : "Your draft is ready to review", done: true };
  if (status === "awaiting-input") return { index: 0, label: "Waiting for your answer", done: false };
  if (status === "failed") return { index: 0, label: "Needs attention", done: false };
  if (status === "stopped") return { index: 0, label: "Stopped", done: false };
  if (status === "coming-soon") return { index: 0, label: "Choose an available format", done: false };
  const latest = events.filter(event => ["agent", "qa"].includes(event.actor) || event.kind === "route").at(-1);
  const activity = latest ? `${latest.stage} ${latest.kind}` : "";
  const index = status === "qa" || /qa|review|quality/i.test(activity) ? 3 : /research|source|evidence|visual-reference/i.test(activity) || status === "researching" ? 1 : /design|artwork|direction|composition|copy|render|poster|carousel|story/i.test(activity) || ["generating", "storyboarding", "rendering"].includes(status) ? 2 : 0;
  return { index, label: PROJECT_STEPS[index], done: false };
}
