"use client";

import { LoaderCircle, MessageSquarePlus, Plus, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { OlaComponentComment, OlaStage, OlaTarget } from "@/lib/ola-edit";
import { olaDocumentKey } from "@/lib/ola-document";
import { OlaLogo } from "./ola-logo";
import { OlaChatComposer, OlaChatMessage, OlaChatPanel } from "./ola-chat";
import styles from "./ola-panel.module.css";
import { ProjectConversation } from "./project-conversation";
import type { RequestSnapshot } from "@/lib/request-workspace";
import { useElapsedSeconds } from "./elapsed-time";
import { secondsLabel } from "@/lib/workflow-timing";

type Message = { id: string; role: "user" | "assistant"; body: string; author: string; stage: OlaStage; proposalId: string | null; proposalStatus?: string | null; createdAt: string };
type Pending<T> = { id: string; stage: OlaStage; baseVersion: number; base: T; origin: T; candidate: T; summary: string; userId: string };

export function useOlaEditor<T>({ projectId, stage, document, baseVersion, selectedTarget, onAccept }: {
  projectId: string; stage: OlaStage; document: T; baseVersion: number; targets?: OlaTarget[]; selectedTarget?: OlaTarget | null; onAccept: (candidate: T) => void;
}) {
  const scope = `${projectId}:${stage}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const activeRequest = useRef<AbortController | null>(null);
  const historyRevision = useRef(0);
  const retryRequest = useRef<{ key: string; id: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<RequestSnapshot | null>(null);
  const [pending, setPending] = useState<Pending<T> | null>(null);
  const [target, setTarget] = useState<OlaTarget | null | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [working, setWorking] = useState(false);
  const workingSeconds = useElapsedSeconds(working);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [olaMode, setOlaMode] = useState(false);
  const [comments, setComments] = useState<Array<OlaComponentComment & { id: string }>>([]);
  const [comment, setComment] = useState("");
  const previousTarget = useRef<OlaTarget | null>(null);
  const commentDraft = useRef(comment);
  commentDraft.current = comment;
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const originalRef = useRef<string | null>(null);
  const currentDocument = useRef(olaDocumentKey(document));
  currentDocument.current = olaDocumentKey(document);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setConversation(null);
    void fetch(`/api/requests/${projectId}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load the original conversation.");
      return response.json();
    }).then(data => { if (!controller.signal.aborted) setConversation(data); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the original conversation."); });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const revision = ++historyRevision.current;
    const controller = new AbortController();
    void fetch(`/api/projects/${projectId}/ola`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error || "Could not load Ola history.");
      return response.json();
    }).then((data) => {
      if (!active || revision !== historyRevision.current) return;
      setMessages(data.messages ?? []);
      const saved = data.pending as Pending<T> | null;
      if (saved?.stage === stage && saved.baseVersion === baseVersion) {
        originalRef.current = olaDocumentKey(saved.origin);
        setPending(saved);
      }
    }).catch((cause) => { if (active && !controller.signal.aborted && revision === historyRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Ola history."); });
    return () => { active = false; controller.abort(); };
  // Reload history after a saved version change; ordinary draft edits are local.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, stage, baseVersion]);

  useEffect(() => { if (selectedTarget !== undefined) setTarget(selectedTarget); }, [selectedTarget]);
  useEffect(() => { setMessages([]); setPending(null); setTarget(undefined); setComments([]); setComment(""); setPrompt(""); setError(""); setWorking(false); originalRef.current = null; retryRequest.current = null; previousTarget.current = null; commentDraft.current = ""; return () => { activeRequest.current?.abort(); activeRequest.current = null; }; }, [stage, projectId]);
  useEffect(() => {
    if (!document || !pending || working || (pending.baseVersion === baseVersion && originalRef.current === currentDocument.current)) return;
    const proposalId = pending.id;
    const revision = ++historyRevision.current;
    setPending(null); originalRef.current = null;
    setError("The draft changed, so Ola's preview was discarded.");
    void fetch(`/api/projects/${projectId}/ola`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId, decision: "discarded", currentDraft: document }) }).then((response) => response.ok ? response.json() : null).then((data) => { if (data?.messages && currentScope.current === scope && revision === historyRevision.current) setMessages(data.messages); }).catch(() => {});
  }, [document, pending, working, projectId, baseVersion]);
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages.length, pending?.id]);

  const preview = pending && pending.baseVersion === baseVersion && originalRef.current === olaDocumentKey(document) ? pending.candidate : null;
  const activeTarget = olaMode ? (target === undefined ? selectedTarget ?? null : target) : null;
  const targetKey = activeTarget ? JSON.stringify(activeTarget) : null;
  useEffect(() => {
    const previous = previousTarget.current;
    const body = commentDraft.current.trim();
    if (previous && body && comments.length < 12) setComments((current) => [...current, { id: crypto.randomUUID(), target: commentTarget(previous), body }]);
    previousTarget.current = activeTarget;
    setComment("");
    if (targetKey) commentInput.current?.focus();
  // Preserve an unfinished comment when selecting the next component or leaving Comment mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  function commentTarget(selected: OlaTarget): OlaTarget {
    const base = preview ?? document;
    for (let length = selected.path.length; length > 0; length--) {
      const path = selected.path.slice(0, length);
      const value = path.reduce<unknown>((item, key) => item && typeof item === "object" ? (item as Record<string | number, unknown>)[key] : undefined, base);
      if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return { ...selected, anchor: { path, id: value.id } };
    }
    return selected;
  }

  function addComment() {
    if (!activeTarget || !comment.trim() || comments.length >= 12 || working) return;
    setComments((current) => [...current, { id: crypto.randomUUID(), target: commentTarget(activeTarget), body: comment.trim() }]);
    setComment(""); setTarget(null); promptInput.current?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const queued = [...comments, ...(activeTarget && comment.trim() ? [{ target: commentTarget(activeTarget), body: comment.trim() }] : [])];
    if (activeRequest.current || working || (!prompt.trim() && !queued.length) || queued.length > 12) return;
    const requestPrompt = prompt.trim() || "Apply the component comments.";
    if (pending && originalRef.current !== olaDocumentKey(document)) { setError("The draft changed. Discard the proposal before prompting Ola again."); return; }
    setWorking(true); setError("");
    historyRevision.current++;
    const controller = new AbortController(); activeRequest.current = controller;
    const base = preview ?? document;
    const original = currentDocument.current;
    const payload = { prompt: requestPrompt, comments: queued.map(({ target, body }) => ({ target, body })), stage, draft: base, baseVersion, target: queued.length ? undefined : activeTarget ?? undefined, refineProposalId: pending?.id };
    const key = olaDocumentKey(payload);
    const requestId = retryRequest.current?.key === key ? retryRequest.current.id : crypto.randomUUID();
    retryRequest.current = { key, id: requestId };
    try {
      const response = await fetch(`/api/projects/${projectId}/ola`, { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ ...payload, requestId }) });
      const data = await response.json().catch(() => { throw new Error("Ola’s connection was interrupted. Send again to retry this request."); });
      if (controller.signal.aborted || currentScope.current !== scope) return;
      if (!response.ok) throw new Error(data.error || "Ola could not edit this project.");
      if (data.regenerating) { window.location.assign(data.redirect ?? window.location.href); return; }
      if (currentDocument.current !== original) {
        if (data.pending?.id) void fetch(`/api/projects/${projectId}/ola`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: data.pending.id, decision: "discarded", currentDraft: document }) }).catch(() => {});
        throw new Error("The draft changed while Ola was working. Prompt again from the current draft.");
      }
      setMessages(data.messages ?? []);
      if (data.pending?.stage === stage && data.pending.baseVersion === baseVersion && olaDocumentKey(data.pending.origin) === original) {
        originalRef.current ??= original;
        setPending(data.pending);
      } else if (!pending) originalRef.current = null;
      retryRequest.current = null;
      setPrompt(""); setComments([]); setComment(""); setTarget(null);
    } catch (cause) { if (!controller.signal.aborted && currentScope.current === scope) setError(cause instanceof Error ? cause.message : "Ola could not edit this project."); }
    finally { if (activeRequest.current === controller) { activeRequest.current = null; setWorking(false); } }
  }

  async function decide(decision: "accepted" | "discarded") {
    if (!pending || working || activeRequest.current) return;
    if (decision === "accepted" && originalRef.current !== olaDocumentKey(document)) { setError("The draft changed. Discard this proposal and ask Ola again."); return; }
    setWorking(true); setError("");
    historyRevision.current++;
    const controller = new AbortController(); activeRequest.current = controller;
    const original = currentDocument.current;
    try {
      const response = await fetch(`/api/projects/${projectId}/ola`, { method: "PATCH", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ proposalId: pending.id, decision, currentDraft: document }) });
      const data = await response.json();
      if (controller.signal.aborted || currentScope.current !== scope) return;
      if (!response.ok) throw new Error(data.error || "Could not update the proposal.");
      if (decision === "accepted" && currentDocument.current !== original) throw new Error("The draft changed while accepting. Ask Ola again from the current draft.");
      if (decision === "accepted" && data.candidate) onAccept(data.candidate as T);
      setMessages(data.messages ?? []);
      setPending(null); originalRef.current = null;
    } catch (cause) { if (!controller.signal.aborted && currentScope.current === scope) setError(cause instanceof Error ? cause.message : "Could not update the proposal."); }
    finally { if (activeRequest.current === controller) { activeRequest.current = null; setWorking(false); } }
  }

  const panel = <>
    <Button variant="outline" size="sm" className={styles.mobileToggle} data-ola-toggle onClick={() => setOpen(true)}><OlaLogo decorative className="h-5 w-auto" /> Ask Ola</Button>
    {open ? <button type="button" className={styles.scrim} data-ola-scrim aria-label="Close Ola" onClick={() => setOpen(false)} /> : null}
    <OlaChatPanel className={`${styles.panel} ${open ? styles.open : ""}`} threadEnd={threadEnd}
      headerAction={<div className={styles.close} data-ola-close><IconButton label="Close Ola" onClick={() => setOpen(false)}><X /></IconButton></div>}
      feedback={<>
        {pending && <div className="mx-4 mb-3 rounded-lg border border-ring/25 bg-accent/50 p-3"><strong className="text-xs font-semibold">{preview ? "Previewing changes" : "Preview expired"}</strong><p className="my-2 text-xs leading-5 text-muted-foreground">{pending.summary}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" className="flex-1" disabled={working} onClick={() => void decide("discarded")}>Discard</Button><Button type="button" size="sm" className="flex-1" disabled={working || !preview} onClick={() => void decide("accepted")}>Accept changes</Button></div></div>}
        {error && <p className="mx-4 mb-3 text-xs leading-5 text-destructive" role="alert">{error}</p>}
      </>}
      composer={<OlaChatComposer value={prompt} onChange={setPrompt} onSubmit={(event) => void submit(event)} working={working} canSubmit={Boolean(prompt.trim() || comments.length || comment.trim())} inputRef={promptInput} placeholder={pending ? "Refine this preview…" : comments.length ? "Add instructions, or press Enter to send comments…" : "Describe what you’d like to change…"}>
        <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">{olaMode ? "Select components to leave comments" : "Click components to edit directly"}</span><IconButton label="Comment mode" variant={olaMode ? "secondary" : "ghost"} aria-pressed={olaMode} onClick={() => setOlaMode((value) => !value)}><MessageSquarePlus /></IconButton></div>
        {comments.length > 0 && <ol className="grid max-h-44 gap-2 overflow-y-auto" aria-label="Queued component comments">{comments.map((item, index) => <li key={item.id} className="rounded-lg border bg-accent/30 p-2.5"><div className="flex items-center justify-between gap-2"><strong className="text-[11px] font-medium">{index + 1}. {item.target.label}</strong><IconButton label={`Remove comment on ${item.target.label}`} size="icon-xs" disabled={working} onClick={() => setComments((current) => current.filter((entry) => entry.id !== item.id))}><X /></IconButton></div><p className="mt-1 text-xs leading-5 whitespace-pre-wrap">{item.body}</p></li>)}</ol>}
        {activeTarget && <div className="grid gap-2 rounded-lg border border-ring/30 bg-accent/30 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs font-medium">{activeTarget.label}</strong><IconButton label="Clear selected component" size="icon-xs" onClick={() => { setTarget(null); setComment(""); }}><X /></IconButton></div><Textarea ref={commentInput} aria-label={`Comment on ${activeTarget.label}`} rows={2} maxLength={500} value={comment} disabled={working || comments.length >= 12} placeholder="What should Ola change here?" onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); addComment(); } }} /><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{comments.length >= 12 ? "Send these comments before adding more" : "Add a comment, then select another component"}</span><Button type="button" variant="outline" size="sm" disabled={working || !comment.trim() || comments.length >= 12} onClick={addComment}><Plus className="size-3.5" /> Add comment</Button></div></div>}
      </OlaChatComposer>}>
      {conversation && <ProjectConversation brief={conversation.brief} events={conversation.events} type={conversation.type} status={conversation.status} createdAt={conversation.createdAt} updatedAt={conversation.updatedAt} />}
      {messages.length === 0 && !conversation ? <div className="my-auto px-3 text-center"><OlaLogo decorative className="mx-auto mb-4 h-12 w-auto" /><strong className="block text-sm font-semibold">What would you like to change?</strong><p className="mt-2 text-xs leading-6 text-muted-foreground">Describe a change, or turn on Comment mode to leave comments on components.</p></div> : messages.map((item) => <OlaChatMessage key={item.id} author={item.role === "assistant" ? "Ola" : item.author} user={item.role === "user"} badge={item.proposalStatus && <Badge variant="outline" className="text-[9px] capitalize">{item.proposalStatus}</Badge>}>{item.body}</OlaChatMessage>)}
      {working && <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-3.5 animate-spin" /> Ola is working…<span className="tabular-nums" aria-live="off"> · {secondsLabel(workingSeconds)}</span></p>}
    </OlaChatPanel>
  </>;
  return { panel, olaMode, setOlaMode, selectionKey: targetKey, preview, previewKey: preview ? pending?.id : null, pending: Boolean(preview), working, setTarget, preparePrompt: (value: string) => { setPrompt(value.slice(0, 2000)); setOlaMode(false); }, invalidate: () => { setPending(null); originalRef.current = null; }, messages };
}
