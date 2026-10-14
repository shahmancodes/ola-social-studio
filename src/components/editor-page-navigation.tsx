"use client";

import type { ReactNode } from "react";
import styles from "./editor-page-navigation.module.css";

export type EditorPage = { id: string; label: string; detail?: string };

export function EditorPageNavigation({ format, pages, activePage, onPageChange, actions, className }: {
  format: string;
  pages: EditorPage[];
  activePage?: string;
  onPageChange?: (id: string) => void;
  actions?: ReactNode;
  className?: string;
}) {
  const label = format === "Article" ? "Sections" : "Slides";
  return <nav className={`${styles.navigation} ${className ?? ""}`} aria-label={`${format} pages`} data-editor-pages>
    <div className={styles.heading}><span>{label}</span><span className={styles.count}>{pages.length}</span></div>
    <div className={styles.list}>
      {pages.map((page, index) => <button key={page.id} type="button" className={`${styles.item} ${activePage === page.id ? styles.active : ""}`} aria-current={activePage === page.id ? "page" : undefined} title={page.label} aria-label={`${format === "Article" ? "Section" : "Slide"} ${index + 1}: ${page.label}`} onClick={() => onPageChange?.(page.id)}>
        <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
        <span className={styles.title}>{page.label}</span>
      </button>)}
    </div>
    {actions ? <div className={styles.actions} role="group" aria-label={`Manage ${label.toLowerCase()}`} data-editor-page-actions>{actions}</div> : null}
  </nav>;
}
