"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, FileText, Image, Layers, LoaderCircle, Presentation, Shapes, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { inferRequestedFormat, isActiveFormat } from "@/lib/format-availability";

export function SimpleCreateForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("content-studio-draft");
    if (saved) {
      setBrief(saved);
      sessionStorage.removeItem("content-studio-draft");
    }
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [brief]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = brief.trim();
    if (busy || prompt.length < 3) return;
    const requestedFormat = inferRequestedFormat(prompt);
    if (requestedFormat && !isActiveFormat(requestedFormat)) { setError(`${requestedFormat} is Coming Soon. Keep your brief and choose Instagram Story or carousel.`); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, brief: prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not start creating.");
      router.push(`/intake/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start creating.");
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const starters = [
    { label: "Instagram Story", brief: "Create one Instagram Story about ", Icon: Smartphone, available: true },
    { label: "Carousel", brief: "Create a six-slide Instagram carousel about ", Icon: Layers, available: true },
    { label: "Post", brief: "", Icon: Image, available: false },
    { label: "Article", brief: "", Icon: FileText, available: false },
    { label: "Presentation", brief: "", Icon: Presentation, available: false },
    { label: "Design", brief: "", Icon: Shapes, available: false },
  ];

  return <div className="space-y-6">
  <Card className="gap-0 p-0 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/25"><form className="flex items-end gap-3 p-4 sm:p-5" onSubmit={submit} aria-label="Create with Ola">
    <label htmlFor="workspace-brief" className="sr-only">Tell Ola what you would like to create</label>
    <Textarea className="min-h-20 flex-1 resize-none border-0 px-0 py-1 text-base shadow-none focus-visible:ring-0" ref={textareaRef} id="workspace-brief" name="brief" value={brief} onChange={(event) => setBrief(event.target.value)} onKeyDown={handleKeyDown} required minLength={3} maxLength={5000} rows={2} placeholder="Describe the Instagram Story or carousel you need…" disabled={busy} />
    <IconButton label={busy ? "Starting your project" : "Send brief"} variant="default" size="icon" type="submit" disabled={busy || brief.trim().length < 3}>{busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}</IconButton>
  </form></Card>
  {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
  <div className="space-y-3 text-center"><p className="text-xs font-medium text-muted-foreground">Start with a format</p><div className="flex flex-wrap justify-center gap-2">{starters.map(({ Icon, ...starter }) => <Button variant="outline" size="sm" className="bg-card" key={starter.label} type="button" disabled={busy || !starter.available} aria-label={starter.available ? starter.label : `${starter.label} Coming Soon`} onClick={() => { setBrief(starter.brief); textareaRef.current?.focus(); }}><Icon />{starter.label}{!starter.available && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">Coming Soon</span>}</Button>)}</div></div>
  <p className="text-center text-xs text-muted-foreground">Press Enter to create · Shift + Enter for a new line</p>
  </div>;
}
