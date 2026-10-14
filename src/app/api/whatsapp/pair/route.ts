import { NextResponse } from "next/server";
import { requireUser } from "@/lib/platform-auth";
import { db } from "@/lib/platform-db";
import { createPairingCode } from "@/lib/whatsapp";

export async function GET() {
  try {
    const user = await requireUser();
    const links = db().prepare("SELECT phone,linked_at FROM whatsapp_links WHERE user_id=? ORDER BY linked_at DESC").all(user.id) as Array<{ phone: string; linked_at: string }>;
    return NextResponse.json({ links: links.map((link) => ({ phone: link.phone, linkedAt: link.linked_at })) }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Sign in required." }, { status: 401 }); }
}

export async function POST() {
  try { const user = await requireUser(); return NextResponse.json({ code: createPairingCode(user.id), expiresInMinutes: 10 }, { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Sign in required." }, { status: 401 }); }
}
