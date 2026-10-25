"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasText } from "@/lib/canvas-text";
import { CANVAS_TYPOGRAPHY } from "@/lib/canvas-typography";
import { textboxCss } from '@/lib/textbox-style';
import { typographyHtml } from '@/lib/design-typography';
import styles from "./visual-content-canvas.module.css";

export function CanvasTextEditor({ target, balanced, disabled, commentMode, selected, onSelect, onDraft, onEditingChange }: {
  target: CanvasText; balanced: boolean; disabled: boolean; commentMode: boolean; selected: boolean;
  onSelect: () => void;
  onDraft: (target: CanvasText, text: string, historyGroup: string) => boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false), changed = useRef(false), composing = useRef(false);
  const initialText = useRef(target.text), currentTarget = useRef(target), session = useRef("");
  const externalText = useRef<string | undefined>(undefined);
  const callback = useRef(onDraft); callback.current = onDraft;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  useLayoutEffect(() => {
    if (!focused.current && !changed.current) {
      // A style change can still carry the last preview's text. Keep the locally
      // published value until a genuinely new text revision reaches the canvas.
      if (externalText.current !== target.text) {
        currentTarget.current = target;
        if (ref.current && ref.current.innerText !== target.text) ref.current.textContent = target.text;
        externalText.current = target.text;
      }
    }
  }, [target]);
  useLayoutEffect(()=>{
    if(ref.current&&!focused.current&&!changed.current)ref.current.innerHTML=typographyHtml(currentTarget.current.text,target.typography,target.accentColor);
  },[target,editing]);
  useLayoutEffect(() => { if ((disabled || commentMode) && focused.current) ref.current?.blur(); }, [disabled, commentMode]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function publish(value?: string) {
    clearTimeout(timer.current);
    if (composing.current || !ref.current) return;
    const text = value ?? ref.current.innerText.replaceAll("\r\n", "\n");
    const current = currentTarget.current;
    if (text === current.text && !changed.current) return;
    if (callback.current(current, text, session.current)) {
      currentTarget.current = { ...current, text, range: current.range ? { start: current.range.start, end: current.range.start + text.length } : undefined };
      changed.current = false;
    }
  }
  return <div ref={ref} data-comment-target data-canvas-text={target.id} className={styles.inlineText}
    role={commentMode ? "button" : "textbox"}
    aria-label={`${commentMode ? "Comment on" : "Edit"} ${target.copyId?.replaceAll("-", " ") ?? target.source.replaceAll(".", " ")}`}
    aria-multiline={commentMode ? undefined : true} aria-readonly={disabled || undefined}
    tabIndex={disabled ? -1 : 0} contentEditable={!disabled && !commentMode ? "plaintext-only" : false}
    suppressContentEditableWarning spellCheck
    style={{ ...CANVAS_TYPOGRAPHY, ...textboxCss(target.textbox), lineHeight:target.typography?.leading??1.15,letterSpacing:`${target.typography?.tracking??0}em`,left: target.x, top: target.y, width: target.width, minHeight: target.textbox ? target.height : Math.max(target.height, target.fontSize * 1.4), fontSize: target.fontSize, fontFamily: target.fontFamily, fontWeight: target.fontWeight, fontStyle: target.italic ? "italic" : "normal", textDecoration: target.underline ? "underline" : "none", color: target.color, textAlign: target.align, textWrap: target.typography?.wrap??(balanced ? "balance" : "wrap") }}
    data-editing={editing || undefined} data-selected={selected || undefined}
    onClick={() => onSelect()}
    onFocus={event => {
      onSelect();
      if (disabled || commentMode) return;
      if (!changed.current) initialText.current = currentTarget.current.text;
      event.currentTarget.textContent=currentTarget.current.text;
      session.current = crypto.randomUUID();
      focused.current = true; setEditing(true); onEditingChange(true);
    }}
    onInput={() => { changed.current = true; clearTimeout(timer.current); if (!composing.current) timer.current = setTimeout(() => publish(), 250); }}
    onCompositionStart={() => { composing.current = true; clearTimeout(timer.current); }}
    onCompositionEnd={() => { composing.current = false; publish(); }}
    onBlur={() => { publish(); focused.current = false; setEditing(false); onEditingChange(false); }}
    onKeyDown={event => {
      if (commentMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(); return; }
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault(); clearTimeout(timer.current);
        event.currentTarget.textContent = initialText.current;
        publish(initialText.current); changed.current = false;
        event.currentTarget.blur();
      } else if ((event.key === "Enter" || event.key.toLowerCase() === "s") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault(); event.stopPropagation(); publish();
        if (event.key === "Enter") event.currentTarget.blur();
      }
    }}
  />;
}
