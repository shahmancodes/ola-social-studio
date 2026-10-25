import { describe, expect, it } from "vitest";
import { workflowConversation } from "./workflow-activity";
import type { WorkflowEvent } from "./workflow-state";

function event(id: string, actor: string, kind: string, stage = "design"): WorkflowEvent {
  return { id, actor, kind, stage, projectId: "project", body: id, data: null, artifactVersion: 1, createdAt: "2026-10-25T10:00:00Z" };
}

describe("compact agent conversation", () => {
  it("collects interleaved updates under the agent that was triggered", () => {
    const thread = workflowConversation([
      event("brief", "user", "prompt"), event("route", "assistant", "route", "intake"),
      event("plan", "agent", "research-plan", "orchestrator"), event("start", "agent", "started"),
      event("research", "agent", "research-started", "research"), event("sources", "agent", "source", "research"),
      event("draft", "agent", "draft"), event("review", "agent", "review-started", "qa"),
      event("pass", "qa", "qa-passed", "visual"), event("done", "assistant", "complete"),
    ], "design");
    expect(thread.map((item) => item.kind)).toEqual(["message", "pipeline"]);
    const pipeline = thread[1];
    if (pipeline.kind !== "pipeline") throw new Error("Expected a pipeline");
    expect(pipeline.agents.map((agent) => agent.name)).toEqual(["Design agent", "Coordinator agent", "Research agent", "QA agent"]);
    expect(pipeline.agents[0].events.map((entry) => entry.id)).toEqual(["route", "start", "draft"]);
    expect(pipeline.agents[3].events.map((entry) => entry.id)).toEqual(["review", "pass", "done"]);
  });

  it("preserves questions and answers between agent runs and ignores system events", () => {
    const thread = workflowConversation([
      event("start", "agent", "started"), event("question", "assistant", "question"),
      event("answer", "user", "answer"), event("internal", "system", "metrics"),
      event("restart", "agent", "started"),
    ], "design");
    expect(thread.map((item) => item.id)).toEqual(["start", "question", "answer", "restart"]);
  });

  it("keeps skipped research in coordinator details", () => {
    const thread = workflowConversation([
      event("plan", "agent", "research-plan", "orchestrator"), event("skip", "agent", "source", "research"),
    ], "poster");
    expect(thread[0]).toMatchObject({ kind: "pipeline", agents: [{ name: "Coordinator agent", events: [{ id: "plan" }, { id: "skip" }] }] });
  });
});
