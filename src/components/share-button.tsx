"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, LoaderCircle, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ShareButton({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy(link = url) {
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setCopied(false); }
  }
  async function share() {
    if (url) { setOpen(true); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/content/${projectId}/share`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create share link.");
      setUrl(data.url); setOpen(true); await copy(data.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create share link."); setOpen(true); }
    finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/content/${projectId}/share`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: url.split("/").at(-1) }) });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not revoke share link.");
      setUrl(""); setOpen(false); setCopied(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke share link."); }
    finally { setBusy(false); }
  }

  return <><IconButton label={busy ? "Creating share link" : "Share project"} disabled={busy} onClick={() => void share()}>{busy ? <LoaderCircle className="animate-spin" /> : <Share2 />}</IconButton>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Share project</DialogTitle><DialogDescription>Anyone with this link can view the saved project. The link expires in three days.</DialogDescription></DialogHeader>
      {url && <div className="flex items-center gap-2"><Input aria-label="Share link" value={url} readOnly onFocus={(event) => event.currentTarget.select()} /><IconButton label={copied ? "Link copied" : "Copy link"} variant="outline" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}</IconButton></div>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {url && <DialogFooter className="sm:justify-between"><Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void revoke()}><Trash2 /> Revoke link</Button><Button asChild><a href={url} target="_blank" rel="noreferrer">Open preview <ExternalLink /></a></Button></DialogFooter>}
    </DialogContent></Dialog>
  </>;
}
