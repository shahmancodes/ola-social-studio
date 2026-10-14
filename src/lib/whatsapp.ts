import crypto from "node:crypto";
import { db, hashToken, id, later, now, projectRow } from "./platform-db";
import { companiesForUser, createProjectRecord, newShareToken, storeProjectReference, type ContentType } from "./platform";
import { isActiveFormat } from "./format-availability";
import { enqueue } from "./platform-db";
import { answerDesignQuestion, DesignIntakeSchema } from "./freeform-design";
import { initializeSpecialistWorkflow, workflowState } from "./workflow-state";
import { answerSpecialistQuestion } from "./content-specialists";

export function verifyMetaSignature(raw: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export async function downloadWhatsAppMedia(mediaId: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WhatsApp token not configured.");
  const base = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v22.0"}`;
  const meta = await fetch(`${base}/${mediaId}`, { headers: { authorization: `Bearer ${token}` } });
  if (!meta.ok) throw new Error(`Media lookup failed (${meta.status}).`);
  const metadata = await meta.json();
  const result = await fetch(metadata.url, { headers: { authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error(`Media download failed (${result.status}).`);
  return { bytes: Buffer.from(await result.arrayBuffer()), mime: String(metadata.mime_type || "application/octet-stream") };
}

export function queueWhatsApp(phone: string, body: string, kind: "text" | "completion" = "text") {
  db().prepare("INSERT INTO messages(id,phone,direction,body,status,created_at) VALUES(?,?,?,?,?,?)")
    .run(id(), phone, "out", JSON.stringify({ text: body, kind }), "queued", now());
}

export async function flushWhatsAppMessages() {
  const rows = db().prepare("SELECT id,phone,body,attempts FROM messages WHERE direction='out' AND status IN ('queued','retry') AND (retry_after IS NULL OR retry_after<=?) ORDER BY created_at LIMIT 10").all(now()) as Array<{ id: string; phone: string; body: string; attempts: number }>;
  for (const row of rows) {
    const payload = JSON.parse(row.body) as { text: string; kind: string };
    const lastInbound = db().prepare("SELECT created_at FROM messages WHERE phone=? AND direction='in' ORDER BY created_at DESC LIMIT 1").get(row.phone) as { created_at: string } | undefined;
    const stale = !lastInbound || Date.now() - Date.parse(lastInbound.created_at) > 24 * 60 * 60 * 1000;
    const templateName = process.env.WHATSAPP_COMPLETION_TEMPLATE;
    if (payload.kind === "completion" && stale && !templateName) continue; // Await an approved completion template.
    try {
      const base = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v22.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const body = payload.kind === "completion" && stale
        ? { messaging_product: "whatsapp", to: row.phone, type: "template", template: { name: templateName, language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type: "text", text: payload.text }] }] } }
        : { messaging_product: "whatsapp", to: row.phone, type: "text", text: { body: payload.text } };
      if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
      const response = await fetch(base, { method: "POST", headers: { authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(result));
      db().prepare("UPDATE messages SET status='accepted',external_id=? WHERE id=?").run(result.messages?.[0]?.id ?? null, row.id);
    } catch (error) {
      const delayMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.min(row.attempts, 7));
      db().prepare("UPDATE messages SET status='retry',attempts=attempts+1,retry_after=? WHERE id=?").run(later(delayMs), row.id);
      process.stderr.write(`WhatsApp send failed; next attempt in ${Math.round(delayMs / 1000)}s: ${String(error)}\n`);
    }
  }
}

export function createPairingCode(userId: string) {
  const code = String(crypto.randomInt(100000, 999999));
  db().prepare("INSERT INTO pairing_codes(code_hash,user_id,expires_at) VALUES(?,?,?)").run(hashToken(code), userId, later(10 * 60_000));
  return code;
}

type Conversation = { companyId?: string; type?: ContentType; brief?: string; instructions?: string; slideCount?: number; projectId?: string; awaitingSources?: boolean; pendingMedia?: Array<{ id: string; name: string }> };
function getState(phone: string): Conversation {
  const row = db().prepare("SELECT state_json FROM conversations WHERE phone=?").get(phone) as { state_json: string } | undefined;
  return row ? JSON.parse(row.state_json) : {};
}
function saveState(phone: string, state: Conversation) {
  db().prepare("INSERT INTO conversations(phone,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at")
    .run(phone, JSON.stringify(state), now());
}

function inferType(text: string): ContentType | undefined {
  if (/\b(carousel|carousell|slides for instagram)\b/i.test(text)) return "carousel";
  if (/\b(presentation|deck|powerpoint|pptx)\b/i.test(text)) return "presentation";
  if (/\b(article|blog|long.form)\b/i.test(text)) return "article";
  if (/\b(instagram story|ig story|insta story|story)\b/i.test(text)) return "story";
  if (/\b(design|cheque|check for (?:a |the )?competition|poster|flyer|certificate|banner|invitation|ticket)\b/i.test(text)) return "design";
  if (/\b(post|graphic|image)\b/i.test(text)) return "post";
}

export async function processWhatsAppMessage(input: { phone: string; externalId: string; text?: string; media?: { id: string; name: string } }) {
  const database = db();
  const duplicate = database.prepare("SELECT id FROM messages WHERE external_id=?").get(input.externalId);
  if (duplicate) return;
  database.prepare("INSERT INTO messages(id,phone,direction,body,external_id,status,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id(), input.phone, "in", input.text ?? `[file] ${input.media?.name ?? ""}`, input.externalId, "received", now());
  const text = (input.text ?? "").trim();
  const pairing = text.match(/^(?:link\s+)?(\d{6})$/i);
  if (pairing) {
    const attempts = database.prepare("SELECT attempts,reset_at FROM pairing_attempts WHERE phone=?").get(input.phone) as { attempts: number; reset_at: string } | undefined;
    if (attempts && attempts.reset_at > now() && attempts.attempts >= 5) { queueWhatsApp(input.phone, "Too many pairing attempts. Try again in 10 minutes."); return; }
    database.prepare("INSERT INTO pairing_attempts(phone,attempts,reset_at) VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END")
      .run(input.phone, 1, later(10 * 60_000), now(), now());
    const row = database.prepare("SELECT user_id FROM pairing_codes WHERE code_hash=? AND expires_at>? AND used_at IS NULL").get(hashToken(pairing[1]), now()) as { user_id: string } | undefined;
    if (row) {
      database.prepare("INSERT INTO whatsapp_links(phone,user_id,linked_at) VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET user_id=excluded.user_id,linked_at=excluded.linked_at").run(input.phone, row.user_id, now());
      database.prepare("UPDATE pairing_codes SET used_at=? WHERE code_hash=?").run(now(), hashToken(pairing[1]));
      database.prepare("DELETE FROM pairing_attempts WHERE phone=?").run(input.phone);
      queueWhatsApp(input.phone, "Linked. Tell me what Instagram Story or carousel you’d like to create."); return;
    }
  }
  const linked = database.prepare("SELECT user_id FROM whatsapp_links WHERE phone=?").get(input.phone) as { user_id: string } | undefined;
  if (!linked) { queueWhatsApp(input.phone, "This number isn’t linked. Sign in to the workspace, open Connect WhatsApp, and send your pairing code here."); return; }
  const companies = companiesForUser(linked.user_id);
  let state = getState(input.phone);
  if (/^cancel\b/i.test(text)) {
    if (state.projectId) {
      const row = projectRow(state.projectId);
      if (row) database.prepare("UPDATE projects SET status='stopped' WHERE id=?").run(state.projectId);
      database.prepare("UPDATE jobs SET status='cancelled' WHERE project_id=? AND status='queued'").run(state.projectId);
    }
    saveState(input.phone, {}); queueWhatsApp(input.phone, "Cancelled. Send a new brief whenever you’re ready."); return;
  }
  if (/^status\b/i.test(text)) {
    const project = state.projectId ? projectRow(state.projectId) : undefined;
    if (project?.status === "complete") {
      const base = process.env.PUBLIC_BASE_URL;
      if (base) queueWhatsApp(input.phone, `Your ${project.content_type} is ready: ${base.replace(/\/$/, "")}/share/${newShareToken(project.id)} (expires in 3 days).`);
      else queueWhatsApp(input.phone, "Your content is ready, but the preview tunnel is offline. Ask for a fresh link when it restarts.");
    } else queueWhatsApp(input.phone, project ? `Your ${project.content_type} is ${project.status}. I’ll send a link only after it’s complete.` : "No active request. Tell me what you’d like to create.");
    return;
  }
  if (state.projectId && projectRow(state.projectId)?.content_type === "design") {
    const project = projectRow(state.projectId)!;
    if (project.status === "awaiting-input") {
      if (!text) { queueWhatsApp(input.phone, "Please reply to the design question in text, or reply cancel."); return; }
      try { answerDesignQuestion(project.id, text); queueWhatsApp(input.phone, "Got it. I’ll check whether anything else is needed."); }
      catch (error) { queueWhatsApp(input.phone, error instanceof Error ? error.message : "I couldn’t save that answer."); }
      return;
    }
  }
  if (state.projectId && projectRow(state.projectId)?.status === "awaiting-input" && workflowState(state.projectId)?.question) {
    if (!text) { queueWhatsApp(input.phone, "Please reply to Ola’s question in text, or reply cancel."); return; }
    try { answerSpecialistQuestion(state.projectId, text); queueWhatsApp(input.phone, "Got it. I’ll continue with the specialist."); }
    catch (error) { queueWhatsApp(input.phone, error instanceof Error ? error.message : "I couldn’t save that answer."); }
    return;
  }
  if (state.projectId && /^(?:new|start over)\b/i.test(text)) state = {};
  if (state.projectId) { queueWhatsApp(input.phone, "That request is already running. Reply “status” or “cancel”; send “new” to start another. To correct it, cancel and send the revised brief."); return; }
  if (input.media) {
    state.pendingMedia = [...(state.pendingMedia ?? []), input.media]; saveState(input.phone, state);
    queueWhatsApp(input.phone, "Got the reference. What should I create with it?"); return;
  }
  if (!state.companyId && companies.length === 1) state.companyId = companies[0].id;
  if (!state.companyId && companies.length > 1) {
    const match = companies.find((company) => company.name.toLowerCase() === text.toLowerCase() || text.toLowerCase().includes(`for ${company.name.toLowerCase()}`));
    if (match) state.companyId = match.id;
  }
  const type = inferType(text);
  if (type) state.type = type;
  const slideCount = text.match(/\b(\d{1,2})\s*(?:-| )?\s*slides?\b/i);
  if (slideCount) state.slideCount = Number(slideCount[1]);
  if (/^\d{1,2}$/.test(text)) state.slideCount = Number(text);
  if (/^(?:auto|you choose)$/i.test(text)) state.slideCount = undefined;
  if (text && !/^(?:new|auto|you choose|\d{1,2})$/i.test(text) && !companies.some((company) => company.name.toLowerCase() === text.toLowerCase())) {
    const correction = text.match(/^(?:actually|correction|change(?: the)? brief to)[:,]?\s+(.+)$/i);
    state.brief = correction ? correction[1] : state.brief ? `${state.brief}\n${text}` : text;
  }
  if (!state.companyId) { saveState(input.phone, state); queueWhatsApp(input.phone, `Which company is this for? ${companies.map((company) => company.name).join(" / ")}`); return; }
  if (state.type && !isActiveFormat(state.type)) { saveState(input.phone, state); queueWhatsApp(input.phone, `${state.type} is Coming Soon. I can make an Instagram Story or carousel from your brief. Reply “Story” or “carousel” to continue.`); return; }
  if (!state.type) { saveState(input.phone, state); queueWhatsApp(input.phone, "Should I make an Instagram Story or carousel?"); return; }
  if (state.slideCount && state.type === "carousel" && (state.slideCount < 3 || state.slideCount > 9)) { saveState(input.phone, state); queueWhatsApp(input.phone, "Carousels can have 3–9 slides. What count should I use, or should I choose automatically?"); return; }
  if (!state.brief || state.brief.length < 12) { saveState(input.phone, state); queueWhatsApp(input.phone, "What topic or message should it cover?"); return; }
  const projectId = createProjectRecord({ companyId: state.companyId, creatorId: linked.user_id, contentType: state.type, brief: state.brief, status: "queued", artifact: { instructions: state.instructions ?? "", slideCount: state.slideCount ?? "auto" } });
  initializeSpecialistWorkflow(projectId, state.type, state.brief, { type: state.type, explicit: true, channel: "whatsapp" });
  for (const media of state.pendingMedia ?? []) {
    try { const downloaded = await downloadWhatsAppMedia(media.id); await storeProjectReference(projectId, media.name, downloaded.bytes, downloaded.mime); }
    catch { queueWhatsApp(input.phone, `I couldn’t download ${media.name}; the request will continue without it.`); }
  }
  enqueue(projectId, "generate-simple");
  state.projectId = projectId; saveState(input.phone, state);
  queueWhatsApp(input.phone, `Started your ${state.type}. I’ll send a preview link when it’s genuinely finished. Reply “status” or “cancel” anytime.`);
}

export function notifyDesignQuestion(projectId: string, question: { text: string; options: string[] }) {
  const row = db().prepare("SELECT phone FROM conversations WHERE json_extract(state_json,'$.projectId')=?").get(projectId) as { phone: string } | undefined;
  if (row) {
    const project = projectRow(projectId);
    const sources = project?.artifact_json ? DesignIntakeSchema.parse(JSON.parse(project.artifact_json)).sources.slice(-2) : [];
    queueWhatsApp(row.phone, `${question.text}${question.options.length ? `\n${question.options.map((option, index) => `${index + 1}. ${option}`).join("\n")}` : ""}${sources.length ? `\nReferences: ${sources.map((source) => source.url).join(" · ")}` : ""}\nReply with your choice or answer.`);
  }
}

export function notifySpecialistQuestion(projectId: string) {
  const row = db().prepare("SELECT phone FROM conversations WHERE json_extract(state_json,'$.projectId')=?").get(projectId) as { phone: string } | undefined;
  const question = workflowState(projectId)?.question;
  if (row && question) queueWhatsApp(row.phone, `${question.text}${question.options.length ? `\n${question.options.map((option, index) => `${index + 1}. ${option}`).join("\n")}` : ""}\nReply with your choice or answer.`);
}

export function notifyNeedsReview(projectId: string) {
  const row = db().prepare("SELECT phone FROM conversations WHERE json_extract(state_json,'$.projectId')=?").get(projectId) as { phone: string } | undefined;
  const project = projectRow(projectId);
  if (row && project?.status === "needs-review") queueWhatsApp(row.phone, `Your ${project.content_type} draft is ready in the workspace, but QA found issues. Open the project to review and edit it.`);
}

export function notifyCompletedProject(projectId: string) {
  const row = db().prepare("SELECT phone FROM conversations WHERE json_extract(state_json,'$.projectId')=?").get(projectId) as { phone: string } | undefined;
  if (!row) return;
  const project = projectRow(projectId); if (!project || project.status !== "complete") return;
  const value = newShareToken(projectId);
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) { queueWhatsApp(row.phone, "Your content is ready, but the preview tunnel is offline. Ask for a fresh link after it restarts."); return; }
  queueWhatsApp(row.phone, `Your ${project.content_type} is ready: ${base.replace(/\/$/, "")}/share/${value}\nRead-only preview and download; expires in 3 days. Sign in to edit.`, "completion");
}

export function notifyFailedProject(projectId: string, reason: string) {
  const row = db().prepare("SELECT phone FROM conversations WHERE json_extract(state_json,'$.projectId')=?").get(projectId) as { phone: string } | undefined;
  if (row) queueWhatsApp(row.phone, `I couldn’t finish this request: ${reason.slice(0, 240)}. It is saved in the workspace so you can retry or edit it.`);
}
