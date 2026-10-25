"use client";

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RotateCw } from 'lucide-react';
import { createSemanticComponent, type SEMANTIC_COMPONENT_CHOICES } from '@/lib/semantic-component-presets';
import styles from './canvas-insert.module.css';

type Choice = (typeof SEMANTIC_COMPONENT_CHOICES)[number];
// Rendering uses Chromium. Keep requests bounded even when searching or scrolling quickly.
const pending: Array<() => Promise<void>> = [];
let active = 0;
function pump() {
  while (active < 2 && pending.length) {
    active++;
    void pending.shift()!().finally(() => { active--; pump(); });
  }
}
const previews = new Map<string, Blob>();
function loadPreview(projectId: string, kind: Choice['kind'], signal: AbortSignal): Promise<Blob> {
  const key = `${projectId}:${kind}`;
  const cached = previews.get(key);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    pending.push(async () => {
      try {
        signal.throwIfAborted();
        const response = await fetch(`/api/content/${projectId}/components/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createSemanticComponent(kind)), signal,
        });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw new Error('Preview unavailable');
        const blob = await response.blob();
        signal.throwIfAborted();
        if (previews.size >= 64) previews.delete(previews.keys().next().value!);
        previews.set(key, blob);
        resolve(blob);
      } catch (error) { reject(error); }
    });
    pump();
  });
}

export function ComponentPreviewCard({ projectId, choice, disabled, onInsert }: {
  projectId: string; choice: Choice; disabled: boolean; onInsert: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    if (card.current) observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let objectUrl = '';
    setFailed(false); setUrl('');
    void loadPreview(projectId, choice.kind, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, projectId, choice.kind, attempt]);
  return <div ref={card} className={styles.componentCard}>
    <button className={styles.card} disabled={disabled} onClick={onInsert} aria-label={`Add ${choice.name}`}>
      <span className={styles.componentPreview}>
        {url ? <img src={url} alt={`${choice.name} preview`} onError={() => { setUrl(''); setFailed(true); }}/>
          : <span className={styles.previewStatus}>{failed ? 'Preview unavailable' : <><LoaderCircle size={18} className={styles.spinner}/> Loading preview…</>}</span>}
      </span>
      <strong>{choice.name}</strong><span>{choice.description}</span>
    </button>
    {failed && <button className={styles.retry} onClick={() => { previews.delete(`${projectId}:${choice.kind}`); setAttempt(value => value + 1); }} aria-label={`Retry ${choice.name} preview`}><RotateCw size={12}/> Retry preview</button>}
  </div>;
}
