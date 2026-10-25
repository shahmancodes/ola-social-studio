"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import styles from './canvas-shortcuts.module.css';

const shortcuts = [
  ['Click + drag', 'Select an area'],
  ['Shift + drag', 'Add to selection'],
  ['Shift + click', 'Select multiple'],
  ['Arrow keys', 'Move 1 px'],
  ['Shift + arrows', 'Move 10 px'],
  ['⌘ / Ctrl + D', 'Duplicate'],
  ['Space + drag', 'Pan canvas'],
  ['Alt + drag', 'Move without snapping'],
] as const;

export function CanvasShortcuts() {
  return <Dialog>
    <DialogTrigger asChild><button type="button" className={styles.trigger}>Shortcuts</button></DialogTrigger>
    <DialogContent className={styles.dialog}>
      <DialogHeader><DialogTitle>Canvas shortcuts</DialogTitle><DialogDescription>Quick ways to select, move, and arrange your design.</DialogDescription></DialogHeader>
      <dl className={styles.list}>{shortcuts.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl>
    </DialogContent>
  </Dialog>;
}
