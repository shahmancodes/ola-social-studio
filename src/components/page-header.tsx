import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, eyebrow, actions, className }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode; className?: string }) {
  return <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-5", className)}>
    <div className="min-w-0 max-w-2xl">
      {eyebrow && <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">{eyebrow}</p>}
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[34px]">{title}</h1>
      {description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </header>;
}
