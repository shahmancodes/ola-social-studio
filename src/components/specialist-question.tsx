"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import styles from "./specialist-question.module.css";

export function SpecialistQuestion({ projectId }: { projectId: string }) {
  const [question, setQuestion] = useState<{ text: string; options: string[] } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch(`/api/requests/${projectId}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load Ola’s question.");
      return data;
    }).then((data) => { if (active) setQuestion(data.question ?? null); }).catch(() => { if (active) setError("Could not load Ola’s question."); });
    return () => { active = false; };
  }, [projectId]);
  async function submit(value: string) {
    if (!value.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/content/${projectId}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: value.trim() }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not save answer.");
      setQuestion(null); setAnswer("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save answer."); }
    finally { setBusy(false); }
  }
  if (!question) return <p>Ola is preparing the next step…</p>;
  return <div className={styles.question}><h2>{question.text}</h2>{question.options.length > 0 && <div className={styles.options}>{question.options.map((option) => <Button variant="outline" key={option} type="button" disabled={busy} onClick={() => void submit(option)}>{option}</Button>)}</div>}
    <form onSubmit={(event) => { event.preventDefault(); void submit(answer); }}><Input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Your answer…" maxLength={2000} aria-label="Your answer" disabled={busy} /><Button variant="outline" disabled={busy || !answer.trim()}>Continue</Button></form>{error && <p role="alert">{error}</p>}</div>;
}
