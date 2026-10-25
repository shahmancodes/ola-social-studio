import {brandRoutingContext} from "./brand-library";
import { z } from "zod";
import type { ContentType } from "./platform";
import { db, enqueue, now, projectRow } from "./platform-db";
import { askWorkflowModel, workflowModelConfigured } from "./workflow-model";
import { initializeSpecialistWorkflow, recordWorkflowEvent, saveWorkflowState, workflowEvents, workflowState } from "./workflow-state";
import { requiredCreativeContextQuestion } from "./creative-context";
import { ClarificationQuestionSchema, CLARIFICATION_GUIDE, generatedQuestion, generateClarificationQuestion } from "./clarification-question";

type SimpleType = Exclude<ContentType, "design">;
const Preflight = z.object({ ready: z.boolean(), question: ClarificationQuestionSchema.nullable(), reason: z.string().max(300) }).refine((result) => result.ready || result.question !== null, "An unready brief needs a generated question and answer options");

const specialist: Record<SimpleType, { shape: string; instructions: (count?: number | "auto") => string; focus: string }> = {
  poster: {
    shape: '{"headline":"...","subline":"...","cta":"... or empty","credit":"optional requested image credit","layout":"hero|split|statement|diagram","eyebrow":"optional requested small label","assetId":"optional supplied id"}',
    instructions: () => "Create ONE A4 portrait poster, 1240 × 1754 pixels. Design for reading at a distance: one dominant headline (under 90 characters), supporting copy under 300 characters, and a clear optional CTA under 60 characters. Use a purposeful typographic, image-led or diagram composition, not a carousel slide or Instagram Story. Preserve exact supplied copy and event details. No page numbers, social UI, fake QR codes, or invented dates or claims. Optional semanticComponent may explain supplied structured data; avoid duplicating its copy in the subline. Use generous edge margins. This is a digital proof, not a print-ready file with bleed or CMYK.",
    focus: "the poster message and required event details or action",
  },
  post: {
    shape: '{"headline":"...","subline":"...","caption":"...","layout":"split","eyebrow":"...","assetId":"optional supplied id"}',
    instructions: () => "One useful, arresting point. Headline and subline must add different information. Caption gives a concrete next action. Keep image copy spare.",
    focus: "the key message and any essential call to action",
  },
  story: {
    shape: '{"headline":"...","subline":"...","cta":"... or empty","storyTreatment":"quick-tip|announcement|image-showcase|conversation-prompt","credit":"optional requested image credit","eyebrow":"...","assetId":"optional supplied id"}',
    instructions: () => "Select a Story treatment that fits the brief and supplied assets: quick-tip for one actionable lesson, announcement for confirmed news or an event, image-showcase only when a relevant rights-cleared image exists, or conversation-prompt for an open question. One static 9:16 frame and ONE message. Headline under 75 characters, subline under 110, optional short CTA. Never imitate poll/question stickers or promise a working Instagram interaction in the PNG. Keep all text in the central safe area. Optional visualContent may be {kind: checklist/process/comparison/example, items: [{label, detail}]}, with 1–4 items (comparison exactly 2). Use only when the brief allows additional copy, and leave subline empty if the component already explains the point. Omit it for exact-copy briefs.",
    focus: "the single message and any essential call to action",
  },
  article: {
    shape: '{"title":"...","sections":[{"title":"...","body":"..."}]}',
    instructions: () => "Write a useful article with short sections and a concrete worked example showing the reader how to apply the advice. Use specific examples, not generic encouragement. Do not invent facts.",
    focus: "the subject and any facts that cannot safely be inferred",
  },
  carousel: {
    shape: '{"title":"...","slides":[{"role":"hook|context|explanation|example|takeaway|close","title":"...","body":"...","cta":"optional requested closing action","credit":"optional requested image credit","layout":"hero|split|steps|statement|diagram|closing","eyebrow":"optional requested small label","assetId":"optional supplied id"}],"caption":"..."}',
    instructions: (count) => `Slides: ${count === "auto" || count === undefined ? "choose 3–9" : `exactly ${count}`}. Give every slide one narrative role. Open with a hook, supply context, explain a useful action, show a concrete example, give a takeaway, and close with a relevant next step. For shorter decks combine adjacent roles without repeating a message. Use at least three purposeful layouts; keep slide text readable at phone size. The caption extends rather than duplicates the slides. Optional visualContent on a slide may be {kind: checklist/process/comparison/example, items: [{label, detail}]}, with at most 4 items (comparison exactly 2). Use meaningful structured content when allowed by the brief; omit it for briefs restricting extra copy. Do not duplicate component text in body. Keep a requested final action in the optional cta field, after the supporting sentence; never replace the sentence with the CTA. No production notes in captions.`,
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
  initializeSpecialistWorkflow(projectId, row.content_type, row.brief);
  const state = workflowState(projectId);
  const config = JSON.parse(row.artifact_json ?? "{}");
  const contextQuestion = await requiredCreativeContextQuestion(`${row.brief}\n${config.instructions ?? ""}`, state?.answers ?? [],JSON.parse(row.brand_snapshot_json),data=>recordWorkflowEvent(projectId,'agent','creative-context',row.content_type,'Assessed request context and compatibility of saved audience and tone defaults.',data));
  if (contextQuestion) {
    if (!state) throw new Error("The specialist requires a conversation before generation.");
    db().prepare("UPDATE projects SET status='awaiting-input',updated_at=? WHERE id=?").run(now(), projectId);
    saveWorkflowState({ ...state, phase: "awaiting-input", question: contextQuestion });
    recordWorkflowEvent(projectId, "assistant", "question", row.content_type, contextQuestion.text, { options: contextQuestion.options });
    return false;
  }
  const events = workflowEvents(projectId);
  const lastRevision = events.findLastIndex((event) => event.kind === "revision");
  if (events.some((event, index) => index > lastRevision && event.kind === "specialist-ready")) return true;
  if (!workflowModelConfigured()) {
    recordWorkflowEvent(projectId, "agent", "specialist-ready", row.content_type, "The brief has enough information to begin.");
    return true;
  }
  const type = row.content_type as SimpleType;
  const savedAssets=db().prepare("SELECT id,name,category FROM assets WHERE company_id=? AND category IN ('artwork','photography','illustration','logo','font','reference') LIMIT 30").all(row.company_id);
  const result = await askWorkflowModel(Preflight, `You are the ${type} specialist preparing a production brief. Decide whether an essential detail is missing that prevents a correct artifact. Ask ONE specific question only if necessary. The master coordinator can send a separate internet research agent to verify public facts, current product features, and official sources before drafting, so do not ask the user for information that public research can find. Ask only for private details, required scope decisions, or information that cannot be researched. Audience and tone have already been assessed separately against the brief and saved brand defaults. Do not ask routine confirmation again; ask only for a remaining consequential production gap. Do not ask for optional colors, slide count or style when the brief permits a sound default. ${CLARIFICATION_GUIDE} The intake coordinator has already selected the format. Do not repeat prior questions. Return ONLY JSON {"ready":boolean,"question":{"text":"...","options":["suggested answer","another suggested answer"]} or null,"reason":"..."}. Focus: ${specialist[type].focus}. Brief: ${JSON.stringify(row.brief)}. Brand: ${JSON.stringify(brandRoutingContext(JSON.parse(row.brand_snapshot_json)))}. Available saved asset metadata: ${JSON.stringify(savedAssets)}. Reference-category images are style previews, not final artwork. An identified suitable saved artwork does not require re-uploading or another asset question. Prior answers: ${JSON.stringify(state?.answers ?? [])}.`);
  const prior = new Set((state?.answers ?? []).map((item) => item.question.toLowerCase()));
  if (!result.ready && result.question) {
    const question = prior.has(result.question.text.toLowerCase())
      ? await generateClarificationQuestion({ brief: row.brief, answers: state?.answers ?? [], goal: `Resolve the still-missing essential detail without repeating this answered question: ${result.question.text}` })
      : generatedQuestion(result.question);
    db().prepare("UPDATE projects SET status='awaiting-input',updated_at=? WHERE id=?").run(now(), projectId);
    if (state) saveWorkflowState({ ...state, phase: "awaiting-input", question });
    recordWorkflowEvent(projectId, "assistant", "question", type, question.text, { options: question.options });
    return false;
  }
  recordWorkflowEvent(projectId, "agent", "specialist-ready", type, `The ${type} brief is ready for production.`, { reason: result.reason });
  return true;
}

export function answerSpecialistQuestion(projectId: string, answer: string) {
  const row = projectRow(projectId); const state = workflowState(projectId);
  if (!row || !(row.content_type in specialist) || row.status !== "awaiting-input" || !state?.question) throw new Error("No specialist question is awaiting an answer.");
  const clean = answer.trim(); if (!clean || clean.length > 2000) throw new Error("Enter an answer of 1–2,000 characters.");
  saveWorkflowState({ ...state, phase: "working", question: null, answers: [...state.answers, { question: state.question.text, answer: clean, purpose: state.question.purpose }] });
  recordWorkflowEvent(projectId, "user", "answer", row.content_type, clean, { question: state.question.text });
  db().prepare("UPDATE projects SET status='queued',updated_at=? WHERE id=?").run(now(), projectId);
  enqueue(projectId, "generate-simple");
}
