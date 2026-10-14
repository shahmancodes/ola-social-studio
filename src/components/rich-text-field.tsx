"use client";
import { IconButton } from "@/components/ui/icon-button";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useEffect } from "react";
import StarterKit from "@tiptap/starter-kit";
import type { Editor, JSONContent } from "@tiptap/core";
import styles from "./rich-text-field.module.css";
import { articleBodyHtml } from "@/lib/article-markdown";
export function RichTextToolbar({ editor, disabled = false }: { editor: Editor | null; disabled?: boolean }) {
  const active = useEditorState({ editor, selector: ({ editor }) => ({ bold: editor?.isActive("bold") ?? false, italic: editor?.isActive("italic") ?? false, bullets: editor?.isActive("bulletList") ?? false, numbers: editor?.isActive("orderedList") ?? false }) });
  return <div className={styles.toolbar} role="toolbar" aria-label="Article text formatting">
    <span className={styles.toolbarLabel}>Text</span>
    <IconButton variant="ghost" size="icon-sm" type="button" disabled={disabled || !editor} label="Bold" title="Bold" aria-pressed={active?.bold ?? false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></IconButton>
    <IconButton variant="ghost" size="icon-sm" type="button" disabled={disabled || !editor} label="Italic" title="Italic" aria-pressed={active?.italic ?? false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></IconButton>
    <span className={styles.divider} />
    <IconButton variant="ghost" size="icon-sm" type="button" disabled={disabled || !editor} label="Bullet list" aria-pressed={active?.bullets ?? false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></IconButton>
    <IconButton variant="ghost" size="icon-sm" type="button" disabled={disabled || !editor} label="Numbered list" aria-pressed={active?.numbers ?? false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></IconButton>
    <span className={styles.toolbarHint}>Select text in the document to format it</span>
  </div>;
}

export function RichTextField({ body, bodyJson, onChange, onEditorReady, disabled = false }: { body: string; bodyJson?: JSONContent; onChange: (json: JSONContent, text: string) => void; onEditorReady: (editor: Editor | null) => void; disabled?: boolean }) {
  const editor = useEditor({ extensions: [StarterKit], immediatelyRender: false, content: bodyJson ?? articleBodyHtml(body), onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText()), editorProps: { attributes: { class: styles.body, "aria-label": "Article section body" } } });
  useEffect(() => { onEditorReady(editor); return () => onEditorReady(null); }, [editor, onEditorReady]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  if (!editor) return null;
  return <div className={styles.editor}><EditorContent editor={editor} /></div>;
}
