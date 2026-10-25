"use client";

import { useId, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function DownloadButton({ projectId, format, disabledReason, needsReview = false }: { projectId: string; format: string; disabledReason?: string; needsReview?: boolean }) {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  const base = `/api/content/${projectId}/download`;
  const options = format === "design" ? [{ label: "PNG image", detail: "Ready to use", href: `${base}?format=png` }, { label: "Editable SVG", detail: "Open in a vector editor", href: `${base}?format=svg` }]
    : format === "carousel" ? [{ label: "Download carousel", detail: "ZIP · ordered PNG slides + caption.txt", href: base }]
    : format === "presentation" ? [{ label: "Download PowerPoint", detail: "Editable PPTX presentation", href: base }]
    : format === "article" ? [{ label: "HTML document", detail: "Formatted article", href: `${base}?format=html` }, { label: "Markdown document", detail: "Plain-text source", href: base }]
    : [{ label: format === "story" ? "Download Story" : format === "poster" ? "Download poster" : "Download image", detail: format === "story" ? "PNG · 1080 × 1920 px" : format === "poster" ? "PNG · A4 portrait · 1240 × 1754 px" : "PNG image", href: base }];
  return <><span title={disabledReason} className="inline-flex"><Button type="button" disabled={Boolean(disabledReason)} aria-describedby={disabledReason ? hintId : undefined} onClick={() => setOpen(true)}><Download /> Download</Button></span>
    {disabledReason && <span id={hintId} className="sr-only">{disabledReason}</span>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Download your work</DialogTitle><DialogDescription>Downloads use your latest saved version.</DialogDescription></DialogHeader>
      {needsReview && <p className="rounded-md border bg-accent/40 p-3 text-xs leading-5">This draft has review findings. Check them before using the download.</p>}
      <div className="grid gap-3">{options.map(option => <Button asChild key={option.href} variant="outline" className="h-auto justify-start gap-3 px-4 py-3"><a href={option.href}><Download className="size-4" /><span className="grid gap-1 text-left"><strong className="text-sm font-medium">{option.label}</strong><small className="text-xs font-normal text-muted-foreground">{option.detail}</small></span></a></Button>)}</div>
    </DialogContent></Dialog>
  </>;
}
