"use client";

import type { WorkflowEvent } from "@/lib/workflow-state";
import { activitySentence, workflowConversation } from "@/lib/workflow-activity";
import { OlaChatMessage } from "./ola-chat";
import { ProjectBriefChoices } from "./project-brief-choices";
import { Fragment } from "react";
import { secondsLabel, workflowTiming } from "@/lib/workflow-timing";

export function ProjectConversation({ brief, events, type, status = "complete", createdAt, updatedAt }: { brief: string; events: WorkflowEvent[]; type: string; status?: string; createdAt?: string; updatedAt?: string }) {
  const conversation = events.filter(event => event.actor === "user" || event.actor === "assistant" && ["question", "answer", "message"].includes(event.kind));
  const pipelines = workflowConversation(events.filter(event => event.actor !== "system"), type).filter(item => item.kind === "pipeline");
  const timing = workflowTiming({ events, status, createdAt, updatedAt }, 0);
  return <>
    {!conversation.some(event => event.actor === "user" && event.kind === "prompt") && <OlaChatMessage author="You" user>{brief}</OlaChatMessage>}
    {conversation.map(event => <Fragment key={event.id}><OlaChatMessage author={event.actor === "user" ? "You" : "Ola"} user={event.actor === "user"}>{event.body}</OlaChatMessage>{event.actor === "user" && event.kind === "prompt" && <ProjectBriefChoices data={event.data} />}</Fragment>)}
    {pipelines.length > 0 && <details className="mb-5 rounded-lg border p-3 text-xs"><summary className="cursor-pointer font-medium text-muted-foreground">How this draft was made{timing.totalSeconds !== null && <span className="ml-2 tabular-nums" title="Initial draft elapsed time, excluding time waiting for answers">{secondsLabel(timing.totalSeconds)}</span>}</summary><div className="mt-3 grid gap-3">{pipelines.flatMap(pipeline => pipeline.agents).map((agent, index) => <details key={`${agent.id}-${index}`}><summary className="cursor-pointer font-medium">{agent.name}</summary><ul className="mt-2 grid gap-2 pl-3 text-[11px] leading-5 text-muted-foreground">{agent.events.map(event => <li key={event.id}><time dateTime={event.createdAt} className="mr-2 whitespace-nowrap tabular-nums">{event.createdAt.slice(11, 19)} UTC</time>{activitySentence(event.body)}</li>)}</ul></details>)}</div></details>}
    <div className="mb-5 border-t pt-4 text-[11px] text-muted-foreground">Your draft is here. Keep the conversation going to make changes.</div>
  </>;
}
