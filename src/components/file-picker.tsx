"use client";

import { useId, useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import styles from "./file-picker.module.css";

export function FilePicker({ name, accept, multiple, required, title, hint, onChange }: {
  name?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  title?: string;
  hint?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  const [files, setFiles] = useState<string[]>([]);
  return <div className={styles.picker}>
    <input id={id} className={styles.input} type="file" name={name} accept={accept} multiple={multiple} required={required} onChange={(event) => { setFiles(Array.from(event.target.files ?? []).map((file) => file.name)); onChange?.(event); }} />
    <label htmlFor={id} className={styles.control}>
      <span className={styles.icon} aria-hidden="true"><Upload size={20} strokeWidth={1.75} /></span>
      <span className={styles.copy}><strong>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : title ?? "Choose files"}</strong><small>{files.length ? files.join(", ") : hint ?? "Select a file from your computer"}</small></span>
      <span className={styles.action}>{files.length ? "Change" : "Browse"}</span>
    </label>
  </div>;
}
