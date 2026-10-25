"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleAlert, CircleHelp, CircleStop, Clock3, FileText, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { OlaChatComposer, OlaChatMessage } from "./ola-chat";
import { OlaLogo } from "./ola-logo";
import type { RequestSnapshot } from "@/lib/request-workspace";
import type { WorkflowEvent } from "@/lib/workflow-state";
import { activitySentence, workflowAgentName, workflowConversation, type AgentActivity } from "@/lib/workflow-activity";
import styles from "./intake-workspace.module.css";
import { PROJECT_STEPS, projectProgress } from "@/lib/project-progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { ProjectBriefChoices } from "./project-brief-choices";
import { useWorkflowClock } from "./elapsed-time";
import { secondsLabel, workflowTiming } from "@/lib/workflow-timing";

const names: Record<string, string> = { intake: "request", post: "social post", story: "story", poster: "poster", article: "article", carousel: "carousel", presentation: "presentation", design: "design" };
const activeStatuses = new Set(["queued", "routing", "clarifying", "generating", "researching", "storyboarding", "rendering", "qa", "draft"]);

function titleFor(event: WorkflowEvent, type: string) {
  if (event.kind === "auto-retry") return "Retrying automatically";
  if (event.kind === "research-plan") return "Research decision";
  if (event.kind === "visual-plan") return "Visual reference decision";
  if (event.kind === "visual-started") return "Finding visual references";
  if (event.kind === "visual-source") return "Visual references found";
  if (event.kind === "research-started") return "Doing research";
  if (event.kind === "source") return "Research results";
  if (event.kind === "started") return `Calling ${workflowAgentName(event.stage)}`;
  if (event.kind === "review-started") return "Calling QA agents";
  if (event.kind === "qa-passed") return `${activitySentence(event.stage.replaceAll("-", " "))} QA passed`;
  if (event.kind === "qa-failed") return `${activitySentence(event.stage.replaceAll("-", " "))} QA found issues`;
  if (event.kind === "draft") return "Editable draft created";
  if (event.kind === "complete") return "Result ready";
  if (event.kind === "quality") return "Review needed";
  if (event.kind === "route" && event.stage === "intake") return `Calling ${workflowAgentName(type)}`;
  if (event.kind === "route" && event.stage === "concept") return "Carousel concepts ready";
  if (event.kind === "route") return "Creative direction selected";
  return activitySentence(event.stage.replaceAll("-", " "));
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

function AgentRow({ agent, type, active, complete, failed }: { agent: AgentActivity; type: string; active: boolean; complete: boolean; failed: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const needsReview = agent.events.at(-1)?.kind === "quality" || agent.events.at(-1)?.kind === "qa-failed";
  const state = failed || needsReview ? "Needs attention" : active ? "Working" : complete ? "Complete" : "Triggered";
  return <li className={styles.agentRow} data-active={active || undefined}>
    <div className={styles.agentHeading}>
      <span className={styles.agentIndicator} role="img" aria-label={state} data-attention={failed || needsReview || undefined}>
        {failed || needsReview ? <CircleAlert size={14} /> : active ? <LoaderCircle size={14} className={styles.spin} /> : complete ? <Check size={14} /> : <span className={styles.agentDot} />}
      </span>
      <span className={styles.agentName}>{agent.name}</span>
      <button type="button" className={styles.agentToggle} aria-label={`${expanded ? "Hide" : "Show"} ${agent.name} details`} aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded((value) => !value)}>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
    <div id={detailId} hidden={!expanded} className={styles.agentDetails}>
      {agent.events.map((event) => <article className={styles.eventEntry} key={event.id}>
        <div className={styles.eventMeta}><h3>{titleFor(event, type)}</h3><time dateTime={event.createdAt}>{event.createdAt.slice(11, 19)} UTC</time></div>
        <p>{activitySentence(event.body)}</p>{detailsFor(event)}
      </article>)}
    </div>
  </li>;
}

export function IntakeWorkspace({ projectId, initialSnapshot }: { projectId: string; initialSnapshot: RequestSnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const conversation = snapshot.events.filter((event) => event.actor !== "system");
  const thread = workflowConversation(conversation, snapshot.type);
  const latestActivity = activityEvents(conversation).at(-1);
  const question = snapshot.status === "awaiting-input" ? snapshot.question : null;
  const working = activeStatuses.has(snapshot.status);
  const waitingInQueue = snapshot.status === "queued" && snapshot.queuedAt !== null && Date.now() - Date.parse(snapshot.queuedAt) > 30_000;
  const progress = projectProgress(snapshot.status, snapshot.events);
  const clock = useWorkflowClock(working);
  const timing = workflowTiming(snapshot, clock ?? 0);

  useEffect(() => {
    if (snapshot.output?.canOpen) router.replace(`/content/${projectId}`);
  }, [projectId, router, snapshot.output?.canOpen]);

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

  if (snapshot.output?.canOpen) return <main className="grid min-h-dvh place-items-center bg-background p-6"><div className="grid justify-items-center gap-4 text-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /><p role="status" className="text-sm">Opening your draft. Your conversation comes with you.</p><Button asChild variant="outline"><Link href={`/content/${projectId}`}>Continue to your draft <ArrowRight className="size-4" /></Link></Button></div></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.topbarLeft}><Link href={snapshot.companyId ? `/projects?company=${snapshot.companyId}` : "/projects"} className={styles.back} aria-label="Back to projects"><ArrowLeft size={18} /></Link><OlaLogo decorative className={styles.brand} /><span>Project workspace</span></div><span className={styles.topbarStatus}><span className={working ? styles.liveDot : styles.stillDot} />{working ? "Creating your draft" : progress.label}{timing.totalSeconds !== null && <span className="whitespace-nowrap tabular-nums" aria-live="off" title="Elapsed time, excluding time waiting for your answers"> · {secondsLabel(timing.totalSeconds)}</span>}{(working || question) && <IconButton label="Stop run" disabled={busy} onClick={() => void stop()}><CircleStop /></IconButton>}</span></header>
    <TooltipProvider delayDuration={150}><nav className={styles.progressRail} aria-label="Project progress"><ol>{PROJECT_STEPS.map((step, index) => <li key={step}><Tooltip><TooltipTrigger asChild><span tabIndex={0} className={styles.progressStep} aria-label={`${step}${timing.steps[index] === null ? "" : ` · ${secondsLabel(timing.steps[index]!)}`}${progress.done || index < progress.index ? " — complete" : index === progress.index ? " — current step" : " — upcoming"}`} aria-current={!progress.done && index === progress.index ? "step" : undefined} data-state={progress.done || index < progress.index ? "complete" : index === progress.index ? "current" : "upcoming"}><span aria-hidden="true" /></span></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{step}{timing.steps[index] !== null && <span className="ml-2 tabular-nums">{secondsLabel(timing.steps[index]!)}</span>}</TooltipContent></Tooltip></li>)}</ol></nav></TooltipProvider>
    <section className={styles.conversation} aria-label="Project conversation">
      <div className={styles.thread} role="log" aria-live="polite">
        <div className={styles.threadContent}>
          <div className={styles.intro}><span className={styles.kicker}><Sparkles size={14} /> {snapshot.type === "intake" ? "Understanding your request" : `Creating your ${names[snapshot.type] ?? snapshot.type}`}</span><h1>Let’s make it happen.</h1></div>
          {!conversation.some((event) => event.actor === "user" && (event.kind === "prompt" || event.body === snapshot.brief)) && <OlaChatMessage author="You" user>{snapshot.brief}</OlaChatMessage>}
          {thread.map((item) => item.kind === "pipeline" ? <details key={item.id} className="mb-5 rounded-lg border p-3 text-xs"><summary className="cursor-pointer font-medium text-muted-foreground">Activity details</summary><ol className={styles.agentPipeline} aria-label="Agent activity">
            {item.agents.map((agent) => <AgentRow key={agent.id} agent={agent} type={snapshot.type} active={working && agent.events.at(-1)?.id === latestActivity?.id} complete={snapshot.status === "complete"} failed={snapshot.status === "failed" && agent.events.at(-1)?.id === latestActivity?.id} />)}
          </ol></details> : question && item.event.actor === "assistant" && item.event.kind === "question" && item.event.body === question.text ? null : <Fragment key={item.id}><OlaChatMessage author={item.event.actor === "user" ? "You" : "Ola"} user={item.event.actor === "user"}>{item.event.body}</OlaChatMessage>{item.event.actor === "user" && item.event.kind === "prompt" && <ProjectBriefChoices data={item.event.data} />}</Fragment>)}
          {question && <div className={styles.questionCard}><div className={styles.questionHeading}><CircleHelp size={17} /><strong>{question.text}</strong></div>{question.options.length > 0 && <div className={styles.options}>{question.options.map((option) => <Button variant="outline" key={option} disabled={busy} onClick={() => void submit(option)}>{option}</Button>)}</div>}<p>{question.options.length ? "Choose an option or type your own answer below." : "Reply below to continue."}</p></div>}
          {working && !latestActivity && <div className={styles.workingRow} role="status"><LoaderCircle size={17} className={styles.spin} /><span>{waitingInQueue ? "Waiting to start…" : "Getting started…"}</span></div>}
          {snapshot.output && <section className={styles.outputCard} aria-label="Result preview"><div className={styles.outputHeader}><span className={styles.kicker}>{snapshot.output.canOpen ? "Your result" : "Draft in progress"}</span><h2>{snapshot.output.title}</h2><p>{snapshot.output.summary}</p></div><div className={styles.outputBody}>{snapshot.output.previewUrl ? <div className={styles.previewFrame}><Image src={snapshot.output.previewUrl} alt={`Preview of ${snapshot.output.title}`} width={540} height={675} unoptimized /></div> : <div className={styles.documentPreview}><FileText size={28} /><strong>{snapshot.output.title}</strong><span>Editable content is ready in the editor.</span></div>}{snapshot.output.pages.length > 0 && <ol className={styles.pageOutline}>{snapshot.output.pages.map((page, index) => <li key={`${page}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{page}</li>)}</ol>}</div>{snapshot.output.canOpen && <div className={styles.outputAction}><Button asChild><Link href={snapshot.output.href}>{snapshot.output.actionLabel ?? "Open editor"} <ArrowRight size={16} /></Link></Button></div>}</section>}
          {snapshot.status === "failed" && <section className={styles.failureCard}><strong>The run stopped before the result was ready.</strong><p>{snapshot.failure ?? "The specialist hit an error. Your project and earlier work are saved."}</p><Button variant="outline" onClick={() => void retry()} disabled={busy}><RotateCcw size={15} />{busy ? "Retrying…" : "Retry"}</Button></section>}
          {snapshot.status === "needs-review" && <p className={styles.reviewNote}>QA found items to check. Open the editor to review the draft.</p>}
          {snapshot.status === "coming-soon" && <section className={styles.questionCard}><strong>Choose a format available now</strong><p>Your original brief is saved above. Start a new Instagram Story, carousel or poster from the workspace.</p><Button asChild><Link href="/workspace">Open workspace <ArrowRight size={16} /></Link></Button></section>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div ref={chatEnd} />
        </div>
      </div>
      <div className={styles.composerWrap}><OlaChatComposer value={answer} onChange={setAnswer} onSubmit={(event) => { event.preventDefault(); void submit(answer); }} disabled={!question} working={busy} placeholder={question ? "Reply to Ola…" : snapshot.output?.canOpen ? "Your result is ready. Open the editor to make changes." : working ? "Ola is working…" : "This request is saved."} footer={question ? undefined : <span className="inline-flex items-center justify-center gap-2">{working ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}{working ? "Ola will ask here if more information is needed." : snapshot.status === "failed" ? "Retry above to continue." : snapshot.output?.canOpen ? "Continue with Ola in the editor." : "Your conversation is saved."}</span>} /></div>
    </section>
  </main>;
}
