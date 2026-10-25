import type { WorkflowEvent } from "./workflow-state";

export type AgentActivity = { id: string; name: string; events: WorkflowEvent[] };
export type ConversationItem =
  | { kind: "message"; id: string; event: WorkflowEvent }
  | { kind: "pipeline"; id: string; agents: AgentActivity[] };

const agentNames: Record<string, string> = {
  intake: "Request", orchestrator: "Coordinator", post: "Social post", story: "Story",
  poster: "Poster", article: "Article", carousel: "Carousel", presentation: "Presentation",
  design: "Design", research: "Research", "visual-reference": "Visual reference", qa: "QA",
};

/** Sentence case for UI copy, preserving acronyms and brand names within the text. */
export function activitySentence(text: string): string {
  return text.replace(/^(\s*)(\p{Ll})/u, (_match, space: string, letter: string) => space + letter.toUpperCase());
}

export function workflowAgentName(stage: string): string {
  const name = stage.trim().replace(/(?:\s+agents?)+$/i, "");
  return `${agentNames[name.toLowerCase()] ?? activitySentence(name.replaceAll("-", " "))} agent`;
}

/** Keep chat turns in order, collecting internal updates into one row per agent. */
export function workflowConversation(events: WorkflowEvent[], type: string): ConversationItem[] {
  const items: ConversationItem[] = [];
  for (const event of events) {
    if (event.actor === "system") continue;
    const isActivity = event.actor === "agent" || event.actor === "qa"
      || event.actor === "assistant" && ["route", "complete", "quality"].includes(event.kind);
    if (!isActivity) {
      items.push({ kind: "message", id: event.id, event });
      continue;
    }
    let pipeline = items.at(-1);
    if (!pipeline || pipeline.kind !== "pipeline") {
      pipeline = { kind: "pipeline", id: event.id, agents: [] };
      items.push(pipeline);
    }
    let key = event.stage;
    if (event.actor === "qa" || ["review-started", "complete", "quality"].includes(event.kind)) key = "qa";
    else if (event.kind === "route" && event.stage === "intake") key = type;
    // A skipped search is a coordinator decision, not a research-agent invocation.
    else if (event.kind === "source" && event.stage === "research"
      && !pipeline.agents.some((agent) => agent.events.some((entry) => entry.kind === "research-started"))) key = "orchestrator";
    const name = workflowAgentName(key);
    const agent = pipeline.agents.find((entry) => entry.name === name);
    if (agent) agent.events.push(event);
    else pipeline.agents.push({ id: event.id, name, events: [event] });
  }
  return items;
}
