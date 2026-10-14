import { NextResponse } from "next/server";
import { processWhatsAppMessage, verifyMetaSignature } from "@/lib/whatsapp";
import { db } from "@/lib/platform-db";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (query.get("hub.mode") === "subscribe" && query.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN) return new Response(query.get("hub.challenge") ?? "");
  return new Response("Verification failed", { status: 403 });
}
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });
  const payload = JSON.parse(raw);
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    for (const status of change.value?.statuses ?? []) db().prepare("UPDATE messages SET status=? WHERE external_id=? AND direction='out'").run(status.status, status.id);
    for (const message of change.value?.messages ?? []) {
      const media = message.image ?? message.document;
      await processWhatsAppMessage({ phone: String(message.from), externalId: String(message.id), text: message.text?.body ?? message.button?.text, media: media?.id ? { id: media.id, name: media.filename ?? "reference-image" } : undefined });
    }
  }
  return NextResponse.json({ ok: true });
}
