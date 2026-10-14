"use client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
export function SignOutButton() {
  const router = useRouter();
  return <Button variant="outline" type="button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }}><LogOut /> Sign out</Button>;
}
