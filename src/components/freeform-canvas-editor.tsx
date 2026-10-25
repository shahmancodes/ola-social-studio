"use client";

import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Canvas, FabricObject } from "fabric";
import type { DesignSpec } from "@/lib/freeform-design";
import type { SlideSpec } from "@/lib/schemas";
import { createSemanticComponent, SEMANTIC_COMPONENT_CHOICES, type SemanticKind } from "@/lib/semantic-component-presets";
import { SemanticComponentFields } from "./semantic-component-fields";
import { ComponentsIcon, ImageIcon, TextIcon } from "./ui-icons";
import { COMMENT_CURSOR, useOlaMode } from "./ola-mode";
import { FontPicker } from "./font-picker";
import { EditorFonts, loadEditorFont } from "./editor-fonts";
import { fontFamily, type CompanyFont, type FontSelection } from "@/lib/font-catalog";
import type { OlaTarget } from "@/lib/ola-edit";

type Element = DesignSpec["elements"][number];
type Component = NonNullable<SlideSpec["semanticComponent"]>;
type ObjectMeta = FontSelection & { id: string; kind: Element["kind"]; referenceId?: string; assetId?: string; sourceWidth?: number; sourceHeight?: number; component?: Component };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const color = (value: unknown, fallback = "#111111") => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

async function loadComponentImage(projectId: string, component: Component) {
  const response = await fetch(`/api/content/${projectId}/components/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(component) });
  if (!response.ok) throw new Error((await response.json()).error ?? "Could not render component.");
  const url = URL.createObjectURL(await response.blob());
  try { const fabric = await import("fabric"); return await fabric.FabricImage.fromURL(url); }
  finally { URL.revokeObjectURL(url); }
}

export function FreeformCanvasEditor({ projectId, companyId, initial, accent, busy, onSave, onDraftChange, onSelectionChange, showSaveButton = true }: { projectId: string; companyId: string; initial: DesignSpec; accent: string; busy: boolean; onSave: (spec: DesignSpec) => Promise<void>; onDraftChange?: (spec: DesignSpec) => void; onSelectionChange?: (target: OlaTarget | null) => void; showSaveButton?: boolean }) {
  const olaMode = useOlaMode();
  const modeRef = useRef(olaMode);
  modeRef.current = olaMode;
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<Canvas | null>(null);
  const metadata = useRef(new WeakMap<FabricObject, ObjectMeta>());
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(initial);
  const onSelectRef = useRef(onSelectionChange);
  onSelectRef.current = onSelectionChange;
  const [selected, setSelected] = useState<FabricObject | null>(null);
  const [revision, setRevision] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [addingComponent, setAddingComponent] = useState(false);
  const [componentKind, setComponentKind] = useState<SemanticKind>("processLoop");
  const [error, setError] = useState("");
  const [fontLibrary, setFontLibrary] = useState<{ fonts: CompanyFont[]; fontCss: string } | null>(null);
  const fontChangeVersion = useRef(0);
  const [pendingFont, setPendingFont] = useState<FontSelection | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setFontLibrary(null);
    fetch(`/api/content/${projectId}/assets`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load company fonts. Refresh to try again.");
      const library = await response.json();
      if (!controller.signal.aborted) setFontLibrary(library);
    }).catch(cause => { if (!controller.signal.aborted) setError(String(cause.message)); });
    return () => controller.abort();
  }, [projectId]);
  const componentRenderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const componentRenderVersion = useRef(0);
  const displayWidth = Math.min(650, initial.size.widthPx);
  const displayHeight = Math.round(displayWidth * initial.size.heightPx / initial.size.widthPx);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!selected || !canvas.current) { onSelectionChange?.(null); return; }
    const index = canvas.current.getObjects().indexOf(selected);
    const meta = metadata.current.get(selected);
    if (index >= 0 && meta) onSelectionChange?.({ label: `${meta.kind === "component" ? "Structured visual" : meta.kind} ${index + 1}`, path: ["elements", index], id: meta.id });
  // Selection changes are the only times the parent target needs updating.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function applyInteractionMode(board: Canvas) {
    board.moveCursor = modeRef.current ? COMMENT_CURSOR : "move";
    for (const object of board.getObjects()) {
      object.set({ lockMovementX: modeRef.current, lockMovementY: modeRef.current, lockScalingX: modeRef.current, lockScalingY: modeRef.current, lockRotation: modeRef.current, hasControls: !modeRef.current, hoverCursor: modeRef.current ? COMMENT_CURSOR : "move" });
      if ("editable" in object) {
        const text = object as FabricObject & { editable: boolean; isEditing?: boolean; exitEditing: () => void };
        if (modeRef.current && text.isEditing) text.exitEditing();
        text.editable = !modeRef.current;
      }
    }
    board.requestRenderAll();
  }
  useEffect(() => { if (canvas.current) applyInteractionMode(canvas.current); }, [olaMode]);

  function toElement(object: FabricObject): Element | null {
    const meta = metadata.current.get(object);
    if (!meta) return null;
    const x = clamp((object.left ?? 0) / displayWidth);
    const y = clamp((object.top ?? 0) / displayHeight);
    const width = clamp(object.getScaledWidth() / displayWidth);
    const height = clamp(object.getScaledHeight() / displayHeight);
    if (meta.kind === "text") {
      const item = object as FabricObject & { text?: string; fontSize?: number; fontWeight?: string | number; fontStyle?: string; textAlign?: string; fill?: unknown };
      return { id: meta.id, kind: "text", text: item.text || " ", font: meta.font, fontId: meta.fontId, x, y, width: Math.max(0.01, width), fontSize: Math.max(0.008, Math.min(0.2, (item.fontSize ?? 25) * (object.scaleY ?? 1) / displayWidth)), color: color(item.fill), weight: item.fontWeight === "bold" || item.fontWeight === 700 ? "bold" : "regular", italic: item.fontStyle === "italic", align: item.textAlign === "center" || item.textAlign === "right" ? item.textAlign : "left" };
    }
    if (meta.kind === "image" && (meta.referenceId || meta.assetId)) {
      const item = object as FabricObject & { cropX?: number; cropY?: number; width: number; height: number };
      const sourceWidth = meta.sourceWidth || 1; const sourceHeight = meta.sourceHeight || 1;
      return { id: meta.id, kind: "image", referenceId: meta.referenceId, assetId: meta.assetId, x, y, width, height, cropX: clamp((item.cropX ?? 0) / sourceWidth), cropY: clamp((item.cropY ?? 0) / sourceHeight), cropWidth: clamp(item.width / sourceWidth), cropHeight: clamp(item.height / sourceHeight) };
    }
    if (meta.kind === "component" && meta.component) return { id: meta.id, kind: "component", component: meta.component, x, y, width, height };
    if (meta.kind === "rect" || meta.kind === "ellipse") return { id: meta.id, kind: meta.kind, x, y, width, height, fill: color(object.fill, "#FFFFFF"), strokeWidth: 0 };
    if (meta.kind === "line") return { id: meta.id, kind: "line", x, y, x2: clamp((object.left + object.getScaledWidth()) / displayWidth), y2: clamp((object.top + object.getScaledHeight()) / displayHeight), color: color(object.stroke), strokeWidth: Math.max(0.001, Math.min(0.02, (object.strokeWidth ?? 2) / displayWidth)) };
    return null;
  }

  function sync() {
    const elements = canvas.current?.getObjects().map(toElement).filter((item): item is Element => item !== null) ?? [];
    const next = { ...draftRef.current, elements };
    draftRef.current = next; setDraft(next); setRevision((value) => value + 1); onDraftChange?.(next);
  }

  useEffect(() => {
    if (!fontLibrary) return;
    let cancelled = false;
    async function setup() {
      const fabric = await import("fabric");
      await Promise.all(initial.elements.filter(e => e.kind === "text").map(e => loadEditorFont(e)));
      if (cancelled || !canvasEl.current) return;
      const board = new fabric.Canvas(canvasEl.current, { width: displayWidth, height: displayHeight, backgroundColor: initial.background, preserveObjectStacking: true, selection: false });
      canvas.current = board;
      const add = (object: FabricObject, meta: Omit<ObjectMeta, "id"> & { id?: string }) => { metadata.current.set(object, { ...meta, id: meta.id ?? crypto.randomUUID() }); board.add(object); };
      for (const [index, element] of initial.elements.entries()) {
        const id = element.id ?? `element-${index + 1}`;
        const left = element.x * displayWidth; const top = element.y * displayHeight;
        if (element.kind === "text") add(new fabric.Textbox(element.text, { left, top, width: element.width * displayWidth, fontSize: element.fontSize * displayWidth, fontFamily: fontFamily(element) ?? "OlaBody", strokeWidth: 0, fontWeight: element.weight === "bold" ? "bold" : "normal", fontStyle: element.italic ? "italic" : "normal", textAlign: element.align, fill: element.color, objectCaching: false }), { id, kind: "text", font: element.font, fontId: element.fontId });
        if (element.kind === "rect") add(new fabric.Rect({ left, top, width: element.width * displayWidth, height: element.height * displayHeight, fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth * displayWidth }), { id, kind: "rect" });
        if (element.kind === "ellipse") add(new fabric.Ellipse({ left, top, rx: element.width * displayWidth / 2, ry: element.height * displayHeight / 2, fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth * displayWidth }), { id, kind: "ellipse" });
        if (element.kind === "line") add(new fabric.Line([left, top, element.x2 * displayWidth, element.y2 * displayHeight], { stroke: element.color, strokeWidth: element.strokeWidth * displayWidth }), { id, kind: "line" });
        if (element.kind === "image") {
          try {
            const image = await fabric.FabricImage.fromURL(element.assetId ? `/api/companies/${companyId}/assets/${element.assetId}` : `/api/content/${projectId}/images/${element.referenceId}`);
            if (cancelled) return;
            const sourceWidth = image.width; const sourceHeight = image.height;
            image.set({ left, top, cropX: element.cropX * sourceWidth, cropY: element.cropY * sourceHeight, width: element.cropWidth * sourceWidth, height: element.cropHeight * sourceHeight, scaleX: element.width * displayWidth / (element.cropWidth * sourceWidth), scaleY: element.height * displayHeight / (element.cropHeight * sourceHeight) });
            add(image, { id, kind: "image", referenceId: element.referenceId, assetId: element.assetId, sourceWidth, sourceHeight });
          } catch { setError("An image could not be loaded. It may need to be uploaded again."); }
        }
        if (element.kind === "component") {
          try {
            const image = await loadComponentImage(projectId, element.component);
            if (cancelled) return;
            image.set({ left, top, scaleX: element.width * displayWidth / image.width, scaleY: element.height * displayHeight / image.height });
            add(image, { id, kind: "component", component: element.component });
          } catch { setError("A structured component could not be loaded."); }
        }
      }
      board.on("mouse:down", (event) => {
        const object = event.target;
        const meta = object ? metadata.current.get(object) : null;
        if (modeRef.current && object && meta) onSelectRef.current?.({ label: `${meta.kind === "component" ? "Structured visual" : meta.kind} ${board.getObjects().indexOf(object) + 1}`, path: ["elements", board.getObjects().indexOf(object)], id: meta.id });
      });
      board.on("selection:created", (event) => setSelected(event.selected?.[0] ?? null));
      board.on("selection:updated", (event) => setSelected(event.selected?.[0] ?? null));
      board.on("selection:cleared", () => setSelected(null));
      applyInteractionMode(board);
      board.on("object:modified", sync);
      board.on("text:changed", sync);
      board.requestRenderAll();
    }
    void setup().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load design fonts."); });
    return () => { cancelled = true; fontChangeVersion.current += 1; componentRenderVersion.current += 1; if (componentRenderTimer.current) clearTimeout(componentRenderTimer.current); canvas.current?.dispose(); canvas.current = null; };
  // The canvas is rebuilt only after a saved version arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, initial, displayWidth, displayHeight, fontLibrary]);

  async function addText() {
    const fabric = await import("fabric"); const board = canvas.current; if (!board) return;
    await loadEditorFont({ font: "brand-body" });
    const object = new fabric.Textbox("Double-click to edit", { left: displayWidth * 0.15, top: displayHeight * 0.35, width: displayWidth * 0.7, fontSize: displayWidth * 0.05, fill: "#111111", fontFamily: "OlaBody", strokeWidth: 0 });
    metadata.current.set(object, { id: crypto.randomUUID(), kind: "text", font: "brand-body" }); board.add(object); board.setActiveObject(object); board.requestRenderAll(); setSelected(object); sync();
  }
  async function addImage(file: File) {
    const board = canvas.current; if (!board) return;
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(`/api/content/${projectId}/images`, { method: "POST", body: form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      const fabric = await import("fabric"); const image = await fabric.FabricImage.fromURL(`/api/content/${projectId}/images/${result.referenceId}`);
      const scale = Math.min(displayWidth * 0.55 / image.width, displayHeight * 0.55 / image.height);
      image.set({ left: displayWidth * 0.2, top: displayHeight * 0.2, scaleX: scale, scaleY: scale });
      metadata.current.set(image, { id: crypto.randomUUID(), kind: "image", referenceId: result.referenceId, sourceWidth: image.width, sourceHeight: image.height });
      board.add(image); board.setActiveObject(image); board.requestRenderAll(); setSelected(image); sync();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add image."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function addComponent() {
    const board = canvas.current; if (!board) return;
    setAddingComponent(true); setError("");
    try {
      const component = createSemanticComponent(componentKind);
      const image = await loadComponentImage(projectId, component);
      const scale = Math.min(displayWidth * 0.7 / image.width, displayHeight * 0.55 / image.height);
      image.set({ left: displayWidth * 0.15, top: displayHeight * 0.25, scaleX: scale, scaleY: scale });
      metadata.current.set(image, { id: crypto.randomUUID(), kind: "component", component });
      board.add(image); board.setActiveObject(image); board.requestRenderAll(); setSelected(image); sync();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add component."); }
    finally { setAddingComponent(false); }
  }
  function updateSelectedComponent(patch: Partial<Component>) {
    if (!selected) return;
    const meta = metadata.current.get(selected);
    if (meta?.kind !== "component" || !meta.component) return;
    const component = { ...meta.component, ...patch };
    metadata.current.set(selected, { ...meta, component });
    sync();
    componentRenderVersion.current += 1;
    const version = componentRenderVersion.current;
    if (componentRenderTimer.current) clearTimeout(componentRenderTimer.current);
    const object = selected;
    componentRenderTimer.current = setTimeout(async () => {
      try {
        const image = await loadComponentImage(projectId, component);
        const board = canvas.current;
        if (!board || version !== componentRenderVersion.current || !board.getObjects().includes(object)) return;
        const keepSelected = board.getActiveObject() === object;
        const layerIndex = board.getObjects().indexOf(object);
        image.set({ left: object.left, top: object.top, angle: object.angle, scaleX: object.getScaledWidth() / image.width, scaleY: object.getScaledHeight() / image.height });
        board.remove(object); board.insertAt(layerIndex, image);
        metadata.current.set(image, { id: meta.id, kind: "component", component });
        if (keepSelected) { board.setActiveObject(image); setSelected(image); }
        board.requestRenderAll(); sync();
      } catch (cause) { if (version === componentRenderVersion.current) setError(cause instanceof Error ? cause.message : "Could not update component."); }
    }, 450);
  }
  function changeSelected(patch: Record<string, unknown>) { if (!selected) return; selected.set(patch); canvas.current?.requestRenderAll(); sync(); }
  async function changeFont(selection: FontSelection) {
    const object = selected;
    if (!object || metadata.current.get(object)?.kind !== "text") return;
    const version = ++fontChangeVersion.current;
    setPendingFont(selection); setError("");
    try {
      const family = await loadEditorFont(selection);
      if (version !== fontChangeVersion.current || !canvas.current?.getObjects().includes(object)) return;
      metadata.current.set(object, { ...metadata.current.get(object)!, ...selection });
      object.set({ fontFamily: family }); object.setCoords(); canvas.current.requestRenderAll(); sync();
    } catch (cause) { if (version === fontChangeVersion.current) setError(cause instanceof Error ? cause.message : "Could not load font."); }
    finally { if (version === fontChangeVersion.current) setPendingFont(null); }
  }
  function cropSelected(field: "cropX" | "cropY" | "cropWidth" | "cropHeight", value: number) {
    if (!selected) return; const meta = metadata.current.get(selected); if (meta?.kind !== "image") return;
    const image = selected as FabricObject & { cropX: number; cropY: number; width: number; height: number };
    const oldWidth = image.getScaledWidth(); const oldHeight = image.getScaledHeight();
    const sourceWidth = meta.sourceWidth || 1; const sourceHeight = meta.sourceHeight || 1;
    const next = { cropX: image.cropX / sourceWidth, cropY: image.cropY / sourceHeight, cropWidth: image.width / sourceWidth, cropHeight: image.height / sourceHeight, [field]: value };
    next.cropX = Math.min(next.cropX, 1 - next.cropWidth); next.cropY = Math.min(next.cropY, 1 - next.cropHeight);
    next.cropWidth = Math.min(next.cropWidth, 1 - next.cropX); next.cropHeight = Math.min(next.cropHeight, 1 - next.cropY);
    image.set({ cropX: next.cropX * sourceWidth, cropY: next.cropY * sourceHeight, width: next.cropWidth * sourceWidth, height: next.cropHeight * sourceHeight });
    image.set({ scaleX: oldWidth / image.width, scaleY: oldHeight / image.height }); image.setCoords(); canvas.current?.requestRenderAll(); sync();
  }
  function deleteSelected() { if (!selected || !canvas.current) return; componentRenderVersion.current += 1; if (componentRenderTimer.current) clearTimeout(componentRenderTimer.current); canvas.current.remove(selected); canvas.current.discardActiveObject(); setSelected(null); sync(); }
  const selectedMeta = selected ? metadata.current.get(selected) : undefined;
  const selectedText = selectedMeta?.kind === "text" ? selected as FabricObject & { text?: string; fontSize?: number; fontWeight?: string | number; fontStyle?: string; fill?: unknown } : null;
  const selectedImage = selectedMeta?.kind === "image" ? selected as FabricObject & { cropX: number; cropY: number; width: number; height: number } : null;
  const selectedComponent = selectedMeta?.kind === "component" ? selectedMeta.component : null;
  void revision;

  return <div className="freeform-editor">
    <EditorFonts companyId={companyId} fonts={fontLibrary?.fonts ?? []}/>
    <style>{fontLibrary?.fontCss ?? ""}</style>
    {!olaMode && <div className="freeform-toolbar">
      <IconButton variant="ghost" size="icon-sm" className="freeform-icon-action" type="button" label="Add text" title="Add text" onClick={() => void addText()}><TextIcon /></IconButton>
      <IconButton variant="ghost" size="icon-sm" className="freeform-icon-action" type="button" label="Add image" title="Add image" onClick={() => fileRef.current?.click()} disabled={uploading}><ImageIcon /></IconButton>
      <details className="freeform-component-menu"><summary className="freeform-icon-action" aria-label="Add component" title="Add component"><ComponentsIcon /></summary><div><label>Choose visual <NativeSelect value={componentKind} onChange={(event) => setComponentKind(event.target.value as SemanticKind)}>{SEMANTIC_COMPONENT_CHOICES.map((choice) => <NativeSelectOption key={choice.kind} value={choice.kind}>{choice.name}</NativeSelectOption>)}</NativeSelect></label><Button variant="outline" type="button" onClick={() => void addComponent()} disabled={addingComponent}>{addingComponent ? "Adding…" : "Add component"}</Button></div></details>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImage(file); }} />
      <label className="freeform-background">Background <input type="color" value={draft.background} onChange={(event) => { const next = { ...draftRef.current, background: event.target.value }; draftRef.current = next; setDraft(next); onDraftChange?.(next); if (canvas.current) { canvas.current.backgroundColor = event.target.value; canvas.current.requestRenderAll(); } }} /></label>
      <label className="freeform-logo"><Checkbox aria-label="Include logo" checked={draft.includeLogo} onCheckedChange={(checked) => { const next = { ...draftRef.current, includeLogo: checked === true }; draftRef.current = next; setDraft(next); onDraftChange?.(next); }} /> Logo</label>
      {showSaveButton ? <Button variant="default" className="primary-button" type="button" disabled={busy || uploading || draft.elements.length === 0} onClick={() => void onSave(draftRef.current)}>{busy ? "Saving…" : "Save and render"}</Button> : null}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="freeform-body">
      <div className="freeform-stage"><canvas ref={canvasEl} /><p>{olaMode ? "Select an element to leave a comment for Ola." : "Click an element to adjust it. Double-click text to type. Drag corners to resize."}</p></div>
      {!olaMode && <aside className="freeform-properties">
        {!selected && <p>Select text or an image to edit it.</p>}
        {selectedText && <><h3>Text</h3><label>Font<FontPicker fonts={fontLibrary?.fonts ?? []} value={pendingFont ?? selectedMeta ?? {}} onChange={selection => void changeFont(selection)} defaultLabel="Brand body"/></label><label>Size <Input type="number" min="8" max="200" value={Math.round((selectedText.fontSize ?? 24) * (selectedText.scaleY ?? 1))} onChange={(event) => changeSelected({ fontSize: Number(event.target.value) / (selectedText.scaleY || 1) })} /></label><div className="freeform-type-controls"><Button variant="outline" type="button" aria-label="Bold" aria-pressed={selectedText.fontWeight === "bold"} onClick={() => changeSelected({ fontWeight: selectedText.fontWeight === "bold" ? "normal" : "bold" })}><strong>B</strong></Button><Button variant="outline" type="button" aria-label="Italic" aria-pressed={selectedText.fontStyle === "italic"} onClick={() => changeSelected({ fontStyle: selectedText.fontStyle === "italic" ? "normal" : "italic" })}><em>I</em></Button><input aria-label="Text color" type="color" value={color(selectedText.fill)} onChange={(event) => changeSelected({ fill: event.target.value })} /></div></>}
        {selectedImage && <><h3>Crop image</h3>{(["cropX", "cropY", "cropWidth", "cropHeight"] as const).map((field) => { const source = field.endsWith("Width") || field === "cropX" ? selectedMeta?.sourceWidth || 1 : selectedMeta?.sourceHeight || 1; const current = field === "cropWidth" ? selectedImage.width : field === "cropHeight" ? selectedImage.height : selectedImage[field]; return <label key={field}>{({ cropX: "Left", cropY: "Top", cropWidth: "Width", cropHeight: "Height" } as const)[field]} <input type="range" min={field === "cropWidth" || field === "cropHeight" ? 5 : 0} max="100" value={Math.round(current / source * 100)} onChange={(event) => cropSelected(field, Number(event.target.value) / 100)} /></label>; })}<Button variant="outline" type="button" onClick={() => { cropSelected("cropX", 0); cropSelected("cropY", 0); cropSelected("cropWidth", 1); cropSelected("cropHeight", 1); }}>Reset crop</Button></>}
        {selectedComponent && <SemanticComponentFields component={selectedComponent} accent={accent} companyId={companyId} onChange={updateSelectedComponent} />}
        {selected && <Button variant="outline" type="button" className="freeform-delete" onClick={deleteSelected}>Delete element</Button>}
      </aside>}
    </div>
  </div>;
}
