import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { Button } from "@/components/ui/button";

export function ActionLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return <Button asChild className={className}><Link {...props}>{children}</Link></Button>;
}

export function ActionButton({ className, children, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button {...props} type={type} className={className}>{children}</Button>;
}
