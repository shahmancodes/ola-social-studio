"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, CircleStop, Clock3, FileText, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { OlaChatComposer, OlaChatMessage } from "./ola-chat";
import { OlaLogo } from "./ola-logo";
import type { RequestSnapshot } from "@/lib/request-workspace";
import type { WorkflowEvent } from "@/lib/workflow-state";
import styles from "./intake-workspace.module.css";

const names: Record<string, string> = { intake: "request", post: "social post", story: "Story", article: "article", carousel: "carousel", presentation: "presentation", design: "design" };
const activeStatuses = new Set(["queued", "routing", "clarifying", "generating", "researching", "storyboarding", "rendering", "qa", "draft"]);

function titleFor(event: WorkflowEvent, type: string) {
  if (event.kind === "research-plan") return "Research decision";
  if (event.kind === "visual-plan") return "Visual reference decision";
  if (event.kind === "visual-started") return "Finding visual references";
  if (event.kind === "visual-source") return "Visual references found";
  if (event.kind === "research-started") return "Doing research";
  if (event.kind === "source") return "Research results";
  if (event.kind === "started") return `Calling ${names[event.stage] ?? event.stage} agent`;
  if (event.kind === "review-started") return "Calling QA agents";
  if (event.kind === "qa-passed") return `${event.stage.replaceAll("-", " ")} QA passed`;
  if (event.kind === "qa-failed") return `${event.stage.replaceAll("-", " ")} QA found issues`;
  if (event.kind === "draft") return "Editable draft created";
  if (event.kind === "complete") return "Result ready";
  if (event.kind === "quality") return "Review needed";
  if (event.kind === "route" && event.stage === "intake") return `Calling ${names[type] ?? type} agent`;
  if (event.kind === "route" && event.stage === "concept") return "Carousel concepts ready";
  if (event.kind === "route") return "Creative direction selected";
  return event.stage.replaceAll("-", " ");
}

function detailsFor(event: WorkflowEvent) {
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const route = record.route && typeof record.route === "object" ? record.route as Record<string, unknown> : null;
  const sources = Array.isArray(record.sources) ? record.sources as Array<Record<string, unknown>> : [];
  const concepts = Array.isArray(record.concepts) ? record.concepts as Array<Record<string, unknown>> : [];
  const issues = Array.isArray(record.issues) ? record.issues.filter((item): item is string => typeof item === "string") : [];
  const size = record.size && typeof record.size === "object" ? record.size as Record<string, unknown> : null;
  return <>
    {route && <div className={styles.eventDetail}><strong>{String(route.name ?? "Selected route")}</strong>{typeof route.message === "string" && <span>{route.message}</span>}{typeof route.payoff === "string" && <small>Audience payoff: {route.payoff}</small>}</div>}
    {concepts.length > 0 && <div className={styles.eventDetail}><strong>Concept options</strong><span>{concepts.slice(0, 3).map((concept) => String(concept.name ?? "Concept")).join(" · ")}</span></div>}
    {sources.length > 0 && <ul className={styles.sourceList}>{sources.slice(0, 4).map((source, index) => <li key={`${String(source.url ?? source.title)}-${index}`}>{typeof source.url === "string" && /^https?:\/\//.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer">{String(source.title ?? source.url)}</a> : String(source.title ?? "Source")}{typeof source.claim === "string" && <span> — {source.claim}</span>}{typeof source.observedPattern === "string" && <span> — {source.observedPattern}</span>}</li>)}</ul>}
    {event.kind === "visual-source" && Array.isArray(record.references) && <ul className={styles.sourceList}>{(record.references as Array<Record<string, unknown>>).slice(0, 4).map((reference, index) => <li key={`${String(reference.url)}-${index}`}><a href={String(reference.url)} target="_blank" rel="noreferrer">{String(reference.title ?? reference.url)}</a>{typeof reference.observedPattern === "string" && <span> — {reference.observedPattern}</span>}</li>)}</ul>}
    {issues.length > 0 && <ul className={styles.issueList}>{issues.slice(0, 4).map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul>}
    {size && <div className={styles.eventDetail}><strong>{String(size.label ?? "Canvas")}</strong><span>{String(size.widthPx ?? "")} × {String(size.heightPx ?? "")} px</span></div>}
    {typeof record.title === "string" && <div className={styles.eventDetail}><strong>{record.title}</strong>{typeof record.pages === "number" && <small>{record.pages} {record.pages === 1 ? "page" : "pages"}</small>}</div>}
  </>;
}

function activityEvents(events: WorkflowEvent[]) {
  return events.filter((event) => event.actor === "agent" || event.actor === "qa" || event.actor === "assistant" && ["route", "complete", "quality"].includes(event.kind));
}

function statusCopy(snapshot: RequestSnapshot) {
  if (snapshot.question && snapshot.status === "awaiting-input") return "Waiting for your answer";
  if (snapshot.status === "complete") return "Ready to open";
  if (snapshot.status === "needs-review") return "Draft ready for review";
  if (snapshot.status === "coming-soon") return "Coming Soon";
  if (snapshot.status === "failed") return "Needs attention";
  if (snapshot.status === "stopped") return "Stopped";
  if (snapshot.type === "intake") return "Understanding your request";
  const last = activityEvents(snapshot.events).at(-1);
  return last ? titleFor(last, snapshot.type) : `Calling ${names[snapshot.type] ?? snapshot.type} agent`;
}

export function IntakeWorkspace({ projectId, initialSnapshot }: { projectId: string; initialSnapshot: RequestSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const conversation = snapshot.events.filter((event) => event.actor !== "system");
  const question = snapshot.status === "awaiting-input" ? snapshot.question : null;
  const working = activeStatuses.has(snapshot.status);
  const waitingInQueue = snapshot.status === "queued" && snapshot.queuedAt !== null && Date.now() - Date.parse(snapshot.queuedAt) > 30_000;

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/requests/${projectId}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load this request.");
        if (active) { setSnapshot(data as RequestSnapshot); setError(""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load this request."); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [conversation.length, question?.text, snapshot.output?.canOpen]);

  async function submit(value: string) {
    const clean = value.trim();
    if (busy || !question || !clean) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/requests/${projectId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: clean }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save your answer.");
      setAnswer("");
      setSnapshot((current) => ({ ...current, status: "queued", question: null, events: [...current.events, { id: crypto.randomUUID(), projectId, actor: "user", kind: "answer", stage: current.type, body: clean, data: null, artifactVersion: null, createdAt: new Date().toISOString() }] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your answer."); }
    finally { setBusy(false); }
  }

  async function stop() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/content/${projectId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not stop this run.");
      setSnapshot((current) => ({ ...current, status: "stopped", question: null }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop this run."); }
    finally { setBusy(false); }
  }

  async function retry() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const url = snapshot.type === "intake" ? `/api/requests/${projectId}` : `/api/content/${projectId}`;
      const body = snapshot.type === "intake" ? { action: "retry" } : null;
      const response = await fetch(url, { method: "POST", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not retry this request.");
      setSnapshot((current) => ({ ...current, status: "queued" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retry this request."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.topbarLeft}><Link href="/projects" className={styles.back} aria-label="Back to projects"><ArrowLeft size={18} /></Link><OlaLogo decorative className={styles.brand} /><span>Project workspace</span></div><span className={styles.topbarStatus}><span className={working ? styles.liveDot : styles.stillDot} />{statusCopy(snapshot)}{(working || question) && <IconButton label="Stop run" disabled={busy} onClick={() => void stop()}><CircleStop /></IconButton>}</span></header>
    <section className={styles.conversation} aria-label="Project conversation">
      <div className={styles.thread} role="log" aria-live="polite">
        <div className={styles.threadContent}>
          <div className={styles.intro}><span className={styles.kicker}><Sparkles size={14} /> {snapshot.type === "intake" ? "Understanding your request" : `Creating your ${names[snapshot.type] ?? snapshot.type}`}</span><h1>Let’s make it happen.</h1></div>
          {!conversation.some((event) => event.actor === "user" && event.body === snapshot.brief) && <OlaChatMessage author="You" user>{snapshot.brief}</OlaChatMessage>}
          {conversation.map((event) => event.actor === "agent" || event.actor === "qa" ? <article className={styles.eventCard} key={event.id}><div className={styles.eventMeta}><span>{event.actor === "qa" ? "QA agent" : `${event.stage.replaceAll("-", " ")} agent`}</span><time dateTime={event.createdAt}>{event.createdAt.slice(11, 16)} UTC</time></div><h3>{titleFor(event, snapshot.type)}</h3><p>{event.body}</p>{detailsFor(event)}</article> : <OlaChatMessage key={event.id} author={event.actor === "user" ? "You" : "Ola"} user={event.actor === "user"}>{event.body}</OlaChatMessage>)}
          {question && <div className={styles.questionCard}><div className={styles.questionHeading}><CircleHelp size={17} /><strong>{question.text}</strong></div>{question.options.length > 0 && <div className={styles.options}>{question.options.map((option) => <Button variant="outline" key={option} disabled={busy} onClick={() => void submit(option)}>{option}</Button>)}</div>}<p>Choose an option or reply below to continue.</p></div>}
          {working && <div className={styles.workingRow} role="status"><LoaderCircle size={17} className={styles.spin} /><span>{statusCopy(snapshot)}…</span></div>}
          {snapshot.output && <section className={styles.outputCard} aria-label="Result preview"><div className={styles.outputHeader}><span className={styles.kicker}>{snapshot.output.canOpen ? "Your result" : "Draft in progress"}</span><h2>{snapshot.output.title}</h2><p>{snapshot.output.summary}</p></div><div className={styles.outputBody}>{snapshot.output.previewUrl ? <div className={styles.previewFrame}><Image src={snapshot.output.previewUrl} alt={`Preview of ${snapshot.output.title}`} width={540} height={675} unoptimized /></div> : <div className={styles.documentPreview}><FileText size={28} /><strong>{snapshot.output.title}</strong><span>Editable content is ready in the editor.</span></div>}{snapshot.output.pages.length > 0 && <ol className={styles.pageOutline}>{snapshot.output.pages.map((page, index) => <li key={`${page}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{page}</li>)}</ol>}</div>{snapshot.output.canOpen && <div className={styles.outputAction}><Button asChild><Link href={snapshot.output.href}>{snapshot.output.actionLabel ?? "Open editor"} <ArrowRight size={16} /></Link></Button></div>}</section>}
          {snapshot.status === "failed" && <section className={styles.failureCard}><strong>The run stopped before the result was ready.</strong><p>{snapshot.failure ?? "The specialist hit an error. Your project and earlier work are saved."}</p><Button variant="outline" onClick={() => void retry()} disabled={busy}><RotateCcw size={15} />{busy ? "Retrying…" : "Retry"}</Button></section>}
          {snapshot.status === "needs-review" && <p className={styles.reviewNote}>QA found items to check. Open the editor to review the draft.</p>}
          {snapshot.status === "coming-soon" && <section className={styles.questionCard}><strong>Choose a format available now</strong><p>Your original brief is saved above. Start a new Instagram Story or carousel from the workspace.</p><Button asChild><Link href="/workspace">Open workspace <ArrowRight size={16} /></Link></Button></section>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div ref={chatEnd} />
        </div>
      </div>
      <div className={styles.composerWrap}><OlaChatComposer value={answer} onChange={setAnswer} onSubmit={(event) => { event.preventDefault(); void submit(answer); }} disabled={!question} working={busy} placeholder={question ? "Reply to Ola…" : snapshot.output?.canOpen ? "Your result is ready. Open the editor to make changes." : working ? "Ola is working…" : "This request is saved."} footer={question ? undefined : <span className="inline-flex items-center justify-center gap-2">{working ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}{working ? "Ola will ask here if more information is needed." : snapshot.status === "failed" ? "Retry above to continue." : snapshot.output?.canOpen ? "Continue with Ola in the editor." : "Your conversation is saved."}</span>} /></div>
    </section>
  </main>;
}
