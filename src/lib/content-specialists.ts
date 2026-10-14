import { z } from "zod";
import type { ContentType } from "./platform";
import { db, enqueue, now, projectRow } from "./platform-db";
import { askWorkflowModel, workflowModelConfigured } from "./workflow-model";
import { recordWorkflowEvent, saveWorkflowState, workflowEvents, workflowState } from "./workflow-state";

type SimpleType = Exclude<ContentType, "design">;
const Preflight = z.object({ ready: z.boolean(), question: z.object({ text: z.string().min(5), options: z.array(z.string()).max(6).default([]) }).nullable(), reason: z.string().max(300) });

const specialist: Record<SimpleType, { shape: string; instructions: (count?: number | "auto") => string; focus: string }> = {
  post: {
    shape: '{"headline":"...","subline":"...","caption":"...","layout":"split","eyebrow":"...","assetId":"optional supplied id"}',
    instructions: () => "One useful, arresting point. Headline and subline must add different information. Caption gives a concrete next action. Keep image copy spare.",
    focus: "the key message and any essential call to action",
  },
  story: {
    shape: '{"headline":"...","subline":"...","cta":"... or empty","storyTreatment":"quick-tip|announcement|image-showcase|conversation-prompt","eyebrow":"...","assetId":"optional supplied id"}',
    instructions: () => "Select a Story treatment that fits the brief and supplied assets: quick-tip for one actionable lesson, announcement for confirmed news or an event, image-showcase only when a relevant rights-cleared image exists, or conversation-prompt for an open question. One static 9:16 frame and ONE message. Headline under 75 characters, subline under 110, optional short CTA. Never imitate poll/question stickers or promise a working Instagram interaction in the PNG. Keep all text in the central safe area.",
    focus: "the single message and any essential call to action",
  },
  article: {
    shape: '{"title":"...","sections":[{"title":"...","body":"..."}]}',
    instructions: () => "Write a useful article with short sections and a concrete worked example showing the reader how to apply the advice. Use specific examples, not generic encouragement. Do not invent facts.",
    focus: "the subject and any facts that cannot safely be inferred",
  },
  carousel: {
    shape: '{"title":"...","slides":[{"role":"hook|context|explanation|example|takeaway|close","title":"...","body":"...","layout":"hero|split|steps|statement|diagram|closing","eyebrow":"...","assetId":"optional supplied id"}],"caption":"..."}',
    instructions: (count) => `Slides: ${count === "auto" || count === undefined ? "choose 3–9" : `exactly ${count}`}. Give every slide one narrative role. Open with a hook, supply context, explain a useful action, show a concrete example, give a takeaway, and close with a relevant next step. For shorter decks combine adjacent roles without repeating a message. Use at least three purposeful layouts; keep slide text readable at phone size. The caption extends rather than duplicates the slides.`,
    focus: "the topic, audience payoff and any mandatory closing message",
  },
  presentation: {
    shape: '{"title":"...","slides":[{"title":"...","body":"...","layout":"hero|split|steps|statement|diagram|closing","eyebrow":"...","assetId":"optional supplied id"}]}',
    instructions: (count) => `Slides: ${count === "auto" || count === undefined ? "choose 3–20" : `exactly ${count}`}. Every slide advances a coherent argument. Use varied layouts, concise editable titles, and a concrete example or diagram slide.`,
    focus: "the presentation purpose, subject and audience if these cannot be inferred",
  },
};

export function contentSpecialist(type: SimpleType) { return specialist[type]; }

export async function assessSpecialistBrief(projectId: string) {
  const row = projectRow(projectId); if (!row || !(row.content_type in specialist)) throw new Error("Content specialist not found.");
  const events = workflowEvents(projectId);
  const lastRevision = events.findLastIndex((event) => event.kind === "revision");
  if (events.some((event, index) => index > lastRevision && event.kind === "specialist-ready")) return true;
  const state = workflowState(projectId);
  if (!workflowModelConfigured()) {
    recordWorkflowEvent(projectId, "agent", "specialist-ready", row.content_type, "The brief has enough information to begin.");
    return true;
  }
  const type = row.content_type as SimpleType;
  const result = await askWorkflowModel(Preflight, `You are the ${type} specialist preparing a production brief. Decide whether an essential detail is missing that prevents a correct artifact. Ask ONE specific question only if necessary. The master coordinator can send a separate internet research agent to verify public facts, current product features, and official sources before drafting, so do not ask the user for information that public research can find. Ask only for private details, required scope decisions, or information that cannot be researched. Do not ask for optional tone, colors, slide count, style, or audience when the company brand permits a sound default. The intake coordinator has already selected the format. Do not repeat prior questions. Return ONLY JSON {"ready":boolean,"question":{"text":"...","options":[]} or null,"reason":"..."}. Focus: ${specialist[type].focus}. Brief: ${JSON.stringify(row.brief)}. Brand: ${row.brand_snapshot_json.slice(0, 4500)}. Prior answers: ${JSON.stringify(state?.answers ?? [])}.`);
  const prior = new Set((state?.answers ?? []).map((item) => item.question.toLowerCase()));
  if (!result.ready && result.question && !prior.has(result.question.text.toLowerCase()) && (state?.answers.length ?? 0) < 3) {
    db().prepare("UPDATE projects SET status='awaiting-input',updated_at=? WHERE id=?").run(now(), projectId);
    if (state) saveWorkflowState({ ...state, phase: "awaiting-input", question: result.question });
    recordWorkflowEvent(projectId, "assistant", "question", type, result.question.text, { options: result.question.options });
    return false;
  }
  recordWorkflowEvent(projectId, "agent", "specialist-ready", type, `The ${type} brief is ready for production.`, { reason: result.reason });
  return true;
}

export function answerSpecialistQuestion(projectId: string, answer: string) {
  const row = projectRow(projectId); const state = workflowState(projectId);
  if (!row || !(row.content_type in specialist) || row.status !== "awaiting-input" || !state?.question) throw new Error("No specialist question is awaiting an answer.");
  const clean = answer.trim(); if (!clean || clean.length > 2000) throw new Error("Enter an answer of 1–2,000 characters.");
  saveWorkflowState({ ...state, phase: "working", question: null, answers: [...state.answers, { question: state.question.text, answer: clean }] });
  recordWorkflowEvent(projectId, "user", "answer", row.content_type, clean, { question: state.question.text });
  db().prepare("UPDATE projects SET status='queued',updated_at=? WHERE id=?").run(now(), projectId);
  enqueue(projectId, "generate-simple");
}
