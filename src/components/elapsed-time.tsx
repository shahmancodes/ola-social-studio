"use client";

import { useEffect, useState } from "react";
import { secondsLabel } from "@/lib/workflow-timing";

export function useWorkflowClock(running: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running]);
  return now;
}

/** A monotonic timer for an operation in the current editor session. */
export function useElapsedSeconds(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!running) return;
    const start = performance.now();
    const interval = window.setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [running]);
  return seconds;
}

export function ElapsedTime({ running }: { running: boolean }) {
  const seconds = useElapsedSeconds(running);
  return running ? <span className="tabular-nums" aria-live="off"> · {secondsLabel(seconds)}</span> : null;
}
