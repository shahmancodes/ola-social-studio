import { describe, expect, it } from "vitest";
import type { WorkflowEvent } from "./workflow-state";
import { secondsLabel, workflowTiming } from "./workflow-timing";

const origin = Date.parse("2026-10-25T10:00:00Z");
const at = (seconds: number) => new Date(origin + seconds * 1000).toISOString();
const event = (second: number, actor: string, kind: string, stage = "intake"): WorkflowEvent => ({ id: `${second}-${kind}`, projectId: "project", actor, kind, stage, body: "", data: null, artifactVersion: 1, createdAt: at(second) });

describe("customer-facing workflow seconds", () => {
  it("counts phase transitions and queue time without counting time waiting for answers", () => {
    const events = [event(0, "user", "prompt"), event(2, "agent", "started"), event(10, "assistant", "question"), event(70, "user", "answer"), event(72, "agent", "started", "poster"), event(80, "agent", "research-started", "research"), event(90, "agent", "source", "research"), event(92, "agent", "started", "poster"), event(100, "agent", "review-started", "qa"), event(110, "assistant", "complete", "poster")];
    expect(workflowTiming({ events, status: "complete", createdAt: at(0) }, origin + 10000 * 1000)).toEqual({ totalSeconds: 50, steps: [12, 12, 16, 10] });
    expect(workflowTiming({ events: [...events, event(500, "agent", "review-started", "qa"), event(600, "assistant", "quality", "poster")], status: "needs-review", updatedAt: at(600) }, origin + 999999)).toEqual({ totalSeconds: 50, steps: [12, 12, 16, 10] });
  });
  it("advances a running step and keeps upcoming step timings unknown", () => {
    const events = [event(0, "user", "prompt"), event(5, "agent", "started", "poster")];
    expect(workflowTiming({ events, status: "generating" }, origin + 20000)).toEqual({ totalSeconds: 20, steps: [5, null, 15, null] });
    expect(workflowTiming({ events, status: "generating" }, origin + 21000).totalSeconds).toBe(21);
  });
  it("freezes while waiting and after cancellation or failure, including reloads", () => {
    const events = [event(0, "user", "prompt"), event(10, "assistant", "question"), event(11, "system", "job-metrics")];
    expect(workflowTiming({ events, status: "awaiting-input", updatedAt: at(10) }, origin + 600000).totalSeconds).toBe(10);
    for (const status of ["failed", "stopped"]) expect(workflowTiming({ events: [event(0, "user", "prompt"), event(15, "agent", "started", "poster"), event(25, "system", "job-metrics")], status, updatedAt: at(20) }, origin + 600000).totalSeconds).toBe(20);
  });
  it("handles unavailable timestamps, sub-second work and clock skew without fabricated durations", () => {
    expect(workflowTiming({ events: [], status: "complete" }, origin).totalSeconds).toBeNull();
    expect(workflowTiming({ events: [], status: "complete", createdAt: at(0), updatedAt: at(5000) }, origin).totalSeconds).toBeNull();
    expect(workflowTiming({ events: [{ ...event(0, "user", "prompt"), createdAt: "invalid" }], status: "queued" }, origin).totalSeconds).toBeNull();
    expect(workflowTiming({ events: [event(0, "user", "prompt"), event(5, "agent", "started", "poster")], status: "generating" }, origin - 10000).totalSeconds).toBe(5);
    expect(secondsLabel(.9)).toBe("0s");
    expect(secondsLabel(125.9)).toBe("125s");
    expect(secondsLabel(-4)).toBe("0s");
  });
});
