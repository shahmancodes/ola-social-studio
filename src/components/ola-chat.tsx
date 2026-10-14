"use client";

import { ArrowUp, LoaderCircle } from "lucide-react";
import type { FormEvent, ReactNode, RefObject } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OlaLogo } from "./ola-logo";
import styles from "./ola-chat.module.css";

export function OlaChatPanel({ children, composer, feedback, headerAction, className, threadEnd }: {
  children: ReactNode; composer: ReactNode; feedback?: ReactNode; headerAction?: ReactNode;
  className?: string; threadEnd?: RefObject<HTMLDivElement | null>;
}) {
  return <aside className={cn(styles.panel, className)} data-ola-panel aria-label="Ola chat">
    <header className={styles.header}><OlaLogo decorative className="h-9 w-auto" />{headerAction}</header>
    <div className={styles.thread} data-ola-thread role="log" aria-live="polite">{children}<div ref={threadEnd} /></div>
    {feedback}
    {composer}
  </aside>;
}

export function OlaChatMessage({ author, user = false, children, badge }: { author: string; user?: boolean; children: ReactNode; badge?: ReactNode }) {
  return <div className={cn(styles.message, user && styles.user)}>
    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span className="font-semibold">{author}</span>{badge}</div>
    <p className="m-0 text-xs leading-6 whitespace-pre-wrap">{children}</p>
  </div>;
}

export function OlaChatComposer({ value, onChange, onSubmit, disabled = false, working = false, canSubmit, placeholder, children, footer, inputRef }: {
  value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void;
  disabled?: boolean; working?: boolean; canSubmit?: boolean; placeholder: string; children?: ReactNode;
  footer?: ReactNode; inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  return <form className={styles.composer} data-ola-composer onSubmit={onSubmit}>
    {children}
    <div className="relative"><Textarea ref={inputRef} aria-label="Message Ola" className="min-h-24 resize-none bg-card pr-12 pb-10 text-sm" value={value} onChange={(event) => onChange(event.target.value)} rows={3} maxLength={2000} disabled={disabled || working} placeholder={placeholder} onKeyDown={(event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
    }} /><div className="absolute right-2 bottom-2"><IconButton label={working ? "Ola is working" : "Send message"} type="submit" variant="default" disabled={disabled || working || !(canSubmit ?? Boolean(value.trim()))}>{working ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}</IconButton></div></div>
    <div className="text-center text-[10px] leading-5 text-muted-foreground">{footer ?? "Enter to send · Shift + Enter for a new line"}</div>
  </form>;
}
