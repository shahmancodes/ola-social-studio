"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Trash2, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import styles from "./company-asset-list.module.css";

type Asset = { id: string; name: string; media_type: string; category: string; usage_role: string; source_url?: string | null };
const groups = [
  { id: "all", label: "All assets" }, { id: "logo", label: "Logos" },
  { id: "wordmark", label: "Wordmarks" },
  { id: "font", label: "Fonts" }, { id: "illustration", label: "Illustrations" },
  { id: "photography", label: "Photography" }, { id: "icon", label: "Icons" },
  { id: "template", label: "Templates" }, { id: "reference", label: "References" },
];
function normalizedCategory(asset: Asset) {
  if (asset.category !== "artwork") return asset.category;
  const source = asset.source_url ?? "";
  if (/^legacy:(icons|badges|emojis)\//.test(source)) return "icon";
  if (/^legacy:internet\//.test(source)) return "reference";
  if (/^legacy:social\//.test(source)) return "template";
  return "illustration";
}
function normalizedRole(asset: Asset) { return asset.usage_role === "supporting" || /^legacy:(secondary|internet)\//.test(asset.source_url ?? "") ? "Supporting" : "Primary"; }
function needsDarkBackground(name: string) { return /light|white|invert/i.test(name); }

export function CompanyAssetList({ companyId, refreshKey, canDelete, onDeleted }: { companyId: string; refreshKey: number; canDelete: boolean; onDeleted?: (assetId: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState("all");
  const [visibleRows, setVisibleRows] = useState(6);
  const [columns, setColumns] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmGridDeleteId, setConfirmGridDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const loadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/companies/${companyId}/assets`, { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Could not load assets."); return response.json(); })
      .then((data) => { if (!controller.signal.aborted) { setAssets(data.assets ?? []); setVisibleRows(6); setError(""); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) { setError("Could not load assets."); setLoading(false); } });
    return () => controller.abort();
  }, [companyId, refreshKey]);
  const visible = useMemo(() => assets.filter((asset) => filter === "all" || normalizedCategory(asset) === filter), [assets, filter]);
  const visibleCount = visibleRows * columns;
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => setColumns(Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [loading, filter]);
  useEffect(() => {
    const target = loadRef.current;
    if (!target || visibleCount >= visible.length) return;
    if (!("IntersectionObserver" in window)) {
      setVisibleRows(Math.ceil(visible.length / columns));
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleRows((rows) => rows + 4);
    }, { rootMargin: "480px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible.length, visibleCount, columns]);
  function closePreview() { setSelected(null); setConfirmDelete(false); setDeleteError(""); setDeleteErrorId(null); }
  async function removeAsset(asset: Asset) {
    setDeletingId(asset.id); setDeleteError(""); setDeleteErrorId(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/assets/${asset.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete asset.");
      setAssets((items) => items.filter((item) => item.id !== asset.id));
      onDeleted?.(asset.id);
      setConfirmGridDeleteId(null);
      if (selected?.id === asset.id) closePreview();
    } catch (error) { setDeleteErrorId(asset.id); setDeleteError(error instanceof Error ? error.message : "Could not delete asset."); }
    finally { setDeletingId(null); }
  }
  if (loading) return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Loading asset library">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}</div>;
  if (error) return <p className={styles.empty} role="alert">{error}</p>;
  return <div className={styles.library}>
    <div className={styles.filters} role="group" aria-label="Filter assets by type">
      {groups.map((group) => { const count = group.id === "all" ? assets.length : assets.filter((asset) => normalizedCategory(asset) === group.id).length; return count > 0 || group.id === "all" ? <Button variant={filter === group.id ? "secondary" : "ghost"} size="sm" key={group.id} type="button" className={filter === group.id ? styles.selected : ""} onClick={() => { setFilter(group.id); setVisibleRows(6); }}>{group.label}<Badge variant="secondary" className="text-[10px]">{count}</Badge></Button> : null; })}
    </div>
    {visible.length ? <><div className={styles.grid} ref={gridRef}>{visible.slice(0, visibleCount).map((asset, index) => {
      const href = `/api/companies/${companyId}/assets/${asset.id}`;
      return <article className={`${styles.card} ${normalizedCategory(asset) === "photography" ? styles.photo : ""} ${needsDarkBackground(asset.name) ? styles.darkPreview : ""}`} key={asset.id}>
        <button className={styles.item} type="button" onClick={(event) => { previewTrigger.current = event.currentTarget; setSelected(asset); setConfirmDelete(false); setDeleteError(""); setDeleteErrorId(null); }} aria-label={`Preview ${asset.name}`}>
          <div className={styles.visual}>{asset.media_type.startsWith("image/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={href} alt="" loading={index < columns ? "eager" : "lazy"} decoding="async" /> : <span className={styles.fileIcon} aria-hidden="true">{normalizedCategory(asset) === "font" ? "Aa" : asset.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span>}</div>
          <div className={styles.caption}><strong>{asset.name}</strong><span>{groups.find((group) => group.id === normalizedCategory(asset))?.label ?? "Artwork"} · {normalizedRole(asset)}</span></div>
        </button>
        {confirmGridDeleteId === asset.id ? <div className={styles.cardConfirm}><span>Delete this asset?</span><div><Button variant="outline" type="button" disabled={deletingId === asset.id} onClick={() => setConfirmGridDeleteId(null)}>Cancel</Button><Button variant="default" className={styles.confirmAction} type="button" disabled={deletingId !== null} onClick={() => void removeAsset(asset)}>{deletingId === asset.id ? "Deleting…" : "Delete"}</Button></div></div> : <div className={styles.cardActions}><IconButton label={`Download ${asset.name}`} asChild><a href={href} download={asset.name}><Download /></a></IconButton>{canDelete && <IconButton label={`Delete ${asset.name}`} className="text-muted-foreground hover:text-destructive" disabled={deletingId !== null} onClick={() => { setConfirmGridDeleteId(asset.id); setDeleteError(""); setDeleteErrorId(null); }}><Trash2 /></IconButton>}</div>}
        {deleteErrorId === asset.id && <p className={styles.cardError} role="alert">{deleteError}</p>}
      </article>;
    })}</div>{visible.length > visibleCount && <div className={styles.loadSentinel} ref={loadRef} role="status">Loading more assets…</div>}</> : <p className={styles.empty}>No assets in this category yet.</p>}
    {selected && <Dialog open onOpenChange={(value) => { if (!value) closePreview(); }}><DialogContent onCloseAutoFocus={(event) => { if (previewTrigger.current?.isConnected) { event.preventDefault(); previewTrigger.current.focus(); } }} showCloseButton={false} className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-3xl">
      <div className={styles.previewHeader}><div><span>{groups.find((group) => group.id === normalizedCategory(selected))?.label ?? "Artwork"} / {normalizedRole(selected)}</span><DialogTitle className="break-all text-lg">{selected.name}</DialogTitle></div><Button variant="ghost" size="icon-sm" aria-label="Close preview" onClick={closePreview}><X /></Button></div>
      <div className={`${styles.previewVisual} ${needsDarkBackground(selected.name) ? styles.previewDark : ""}`}>{selected.media_type.startsWith("image/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/companies/${companyId}/assets/${selected.id}`} alt={selected.name} /> : <span>{normalizedCategory(selected) === "font" ? "Aa" : selected.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span>}</div>
      <div className={styles.previewFooter}><DialogDescription>{selected.media_type.startsWith("image/") ? "Preview this asset here or download the file." : "Download this file to view it in its native application."}</DialogDescription><div className={styles.previewActions}><a href={`/api/companies/${companyId}/assets/${selected.id}`} download={selected.name}>Download <span aria-hidden="true">↓</span></a>{canDelete && (confirmDelete ? <><Button variant="destructive" type="button" className={styles.deleteConfirm} disabled={deletingId !== null} onClick={() => void removeAsset(selected)}>{deletingId === selected.id ? "Deleting…" : "Delete permanently"}</Button><Button variant="outline" type="button" disabled={deletingId === selected.id} onClick={() => setConfirmDelete(false)}>Cancel</Button></> : <Button variant="outline" type="button" className={styles.delete} disabled={deletingId !== null} onClick={() => setConfirmDelete(true)}>Delete asset</Button>)}</div></div>
      {confirmDelete && <p className={styles.deleteNote}>This removes the asset from your company library and brand guide.</p>}{deleteErrorId === selected.id && <p className={styles.deleteError} role="alert">{deleteError}</p>}
    </DialogContent></Dialog>}
  </div>;
}
