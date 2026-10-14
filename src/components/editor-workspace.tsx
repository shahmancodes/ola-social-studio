"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Save, MessageSquarePlus, Settings2, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EditorPageNavigation, type EditorPage } from "./editor-page-navigation";
import { IconButton } from "@/components/ui/icon-button";
import { OlaModeContext } from "./ola-mode";
import { cn } from "@/lib/utils";
import styles from "./editor-workspace-dock.module.css";

export type { EditorPage } from "./editor-page-navigation";

type Props = {
  format: string; title?: string; status?: string; pages?: EditorPage[]; activePage?: string;
  onPageChange?: (id: string) => void; pageActions?: ReactNode; inspector?: ReactNode; ola?: ReactNode;
  previewing?: boolean; children: ReactNode; actions?: ReactNode; onSave?: () => void; saveLabel?: string;
  saving?: boolean; saveDisabled?: boolean; dirty?: boolean; note?: string; embedded?: boolean;
  formatting?: ReactNode; olaMode?: boolean; onOlaModeChange?: (enabled: boolean) => void; olaSelectionKey?: string | null;
};

export function UniversalEditor({ format, title, status, pages, activePage, onPageChange, pageActions, inspector, ola, previewing = false, children, actions, onSave, saveLabel = "Save and render", saving = false, saveDisabled = false, dirty = false, note, embedded = false, formatting, olaMode = false, onOlaModeChange, olaSelectionKey }: Props) {
  const [olaOpen, setOlaOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const chatId = useId();
  useEffect(() => { if (olaMode && !window.matchMedia("(max-width: 900px)").matches) setOlaOpen(true); }, [olaMode]);
  useEffect(() => { if (olaMode && olaSelectionKey) setOlaOpen(true); }, [olaMode, olaSelectionKey]);
  useEffect(() => { setMounted(true); if (window.matchMedia("(max-width: 900px)").matches) setOlaOpen(false); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!onSave) return;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!saving && !saveDisabled) onSave(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [onSave, saving, saveDisabled]);
  const showChat = Boolean(ola && olaOpen);
  const state = saving ? "Saving…" : dirty ? "Unsaved changes" : status === "complete" ? "Saved" : (status ?? "Saved").replaceAll("-", " ");

  return <OlaModeContext.Provider value={olaMode}>
    <section className={styles.editor} data-ola-dock={showChat ? "open" : undefined} aria-label={`${format} editor`}>
      <div className={styles.toolbar}>
        <div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2"><span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{format} editor</span><Badge variant="secondary" className="text-[10px] capitalize" role="status">{state}</Badge></div>{title && !embedded && <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>}</div>
        <div className={styles.actions}>
          {actions}
          {onOlaModeChange && <IconButton label="Comment mode" aria-pressed={olaMode} variant={olaMode ? "secondary" : "ghost"} onClick={() => onOlaModeChange(!olaMode)}><MessageSquarePlus /></IconButton>}
          {ola && <IconButton label={showChat ? "Hide Ola chat" : "Show Ola chat"} variant={showChat ? "secondary" : "ghost"} aria-expanded={showChat} aria-controls={chatId} onClick={() => setOlaOpen((value) => !value)}><Sparkles /></IconButton>}
          {onSave && <IconButton label={saving ? "Saving changes" : saveLabel} variant="default" disabled={saving || saveDisabled} onClick={onSave}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}</IconButton>}
        </div>
      </div>
      {formatting && <div className="border-b bg-background px-4 py-2">{formatting}</div>}
      {note && <p className="border-b bg-muted/35 px-4 py-2 text-[11px] leading-5 text-muted-foreground">{note}</p>}
      <div className={cn(styles.workspace, pages?.length && styles.withPages, inspector && styles.withInspector)}>
        {pages?.length ? <EditorPageNavigation className={styles.pages} format={format} pages={pages} activePage={activePage} onPageChange={onPageChange} actions={pageActions} /> : null}
        <div className={cn(styles.stage, previewing && styles.previewing)}>{children}</div>
        {inspector && <aside className={cn(styles.inspector, previewing && styles.previewing)} aria-label="Editor controls"><h3 className="mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Settings2 className="size-3.5" /> Content and settings</h3>{olaMode ? <><p className="mb-4 text-xs leading-5 text-muted-foreground">Comment mode is on. Select a component and add a comment in chat.</p><fieldset disabled className="m-0 min-w-0 border-0 p-0 opacity-60">{inspector}</fieldset></> : inspector}</aside>}
      </div>
    </section>
    {mounted && showChat && createPortal(<div id={chatId} className={styles.ola} data-editor-ola>{ola}<div className={styles.chatClose}><IconButton label="Close Ola chat" onClick={() => setOlaOpen(false)}><X /></IconButton></div></div>, document.body)}
  </OlaModeContext.Provider>;
}
