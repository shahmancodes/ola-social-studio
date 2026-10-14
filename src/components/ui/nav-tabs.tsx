import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NavTabs({ items, label, className }: { items: { label: string; href: string; active: boolean }[]; label: string; className?: string }) {
  return <nav aria-label={label} className={cn("mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1", className)}>
    {items.map((item) => <Button key={item.href} asChild variant="ghost" size="sm" className={cn("text-muted-foreground", item.active && "bg-card text-foreground shadow-xs hover:bg-card")}><Link href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link></Button>)}
  </nav>;
}
