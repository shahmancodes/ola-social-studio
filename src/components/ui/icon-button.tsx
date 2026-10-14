"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function IconButton({ label, children, variant = "ghost", size = "icon-sm", ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <Tooltip>
    <TooltipTrigger asChild><span className="inline-flex"><Button type="button" variant={variant} size={size} aria-label={label} {...props}>{children}</Button></span></TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}
