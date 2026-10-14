import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createGateway, generateText, stepCountIs } from "ai";
import { OpenRouter, callModel, hasToolCall, serverTool, stepCountIs as openRouterStepCountIs, tool } from "@openrouter/agent";
import { z } from "zod";
import { companyStorageDir, getCompany, updateProjectRecord, type Brand } from "./platform";
import { db, enqueue, projectRow } from "./platform-db";
import { SemanticComponentSchema } from "./schemas";
import { componentIllustrationData, renderSemanticComponentPng } from "./semantic-component-image";
import { reviewDesignVisual } from "./quality-gates";
import { askWorkflowModel } from "./workflow-model";
import { recordWorkflowEvent, recordWorkflowQa, saveWorkflowState, workflowContext, workflowState } from "./workflow-state";
import { planInternetResearch } from "./internet-research-plan";
import { planVisualReferences, researchVisualReferences, VisualReferenceResearchSchema } from "./visual-reference-research";

const Source = z.object({ title: z.string(), url: z.string().url(), note: z.string() });
const Size = z.object({ label: z.string().min(1), widthPx: z.number().int().min(128).max(6000), heightPx: z.number().int().min(128).max(6000), note: z.string().default("") });
const Question = z.object({ text: z.string().min(5), options: z.array(z.string()).max(6).default([]) });
export const DesignIntakeSchema = z.object({ phase: z.literal("intake"), instructions: z.string().default(""), referenceNotes: z.string().default(""), answers: z.array(z.object({ question: z.string(), answer: z.string() })).default([]), sources: z.array(Source).default([]), question: Question.optional(), size: Size.optional() });
export type DesignIntake = z.infer<typeof DesignIntakeSchema>;
const Decision = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("ask"), question: Question, sources: z.array(Source).max(8).default([]) }),
  z.object({ phase: z.literal("ready"), size: Size, sources: z.array(Source).max(8).default([]) }),
]);

const Fraction = z.number().min(0).max(1);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const ElementId = z.string().min(1).max(120).optional();
const TextElement = z.object({ id: ElementId, kind: z.literal("text"), text: z.string().min(1).max(300), x: Fraction, y: Fraction, width: Fraction, fontSize: z.number().min(0.008).max(0.2), color: Color, weight: z.enum(["regular", "bold"]).default("regular"), italic: z.boolean().default(false), align: z.enum(["left", "center", "right"]).default("left") });
const ShapeElement = z.object({ id: ElementId, kind: z.enum(["rect", "ellipse"]), x: Fraction, y: Fraction, width: Fraction, height: Fraction, fill: Color, stroke: Color.optional(), strokeWidth: z.number().min(0).max(0.02).default(0) });
const LineElement = z.object({ id: ElementId, kind: z.literal("line"), x: Fraction, y: Fraction, x2: Fraction, y2: Fraction, color: Color, strokeWidth: z.number().min(0.001).max(0.02) });
const ImageElement = z.object({ id: ElementId, kind: z.literal("image"), referenceId: z.string().min(1).optional(), assetId: z.string().min(1).optional(), x: Fraction, y: Fraction, width: Fraction, height: Fraction, cropX: Fraction.default(0), cropY: Fraction.default(0), cropWidth: Fraction.default(1), cropHeight: Fraction.default(1) });
const ComponentElement = z.object({ id: ElementId, kind: z.literal("component"), component: SemanticComponentSchema, x: Fraction, y: Fraction, width: Fraction, height: Fraction });
export const DesignElementSchema = z.discriminatedUnion("kind", [TextElement, z.object({ ...ShapeElement.shape, kind: z.literal("rect") }), z.object({ ...ShapeElement.shape, kind: z.literal("ellipse") }), LineElement, ImageElement, ComponentElement]);
export const DesignSpecSchema = z.object({ type: z.literal("design"), title: z.string().min(1).max(120), size: Size, background: Color, includeLogo: z.boolean().default(true), elements: z.array(DesignElementSchema).min(1).max(50), sources: z.array(Source).default([]), visualReferences: VisualReferenceResearchSchema.optional(), svgPath: z.string().optional(), imagePath: z.string().optional() });
export type DesignSpec = z.infer<typeof DesignSpecSchema>;

function parseJson(text: string) { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
function escape(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }

async function askWithSearch(prompt: string): Promise<z.infer<typeof Decision>> {
  if (process.env.AI_GATEWAY_API_KEY) {
    try {
      const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
      const result = await generateText({ model: gateway(process.env.VERCEL_AI_MODEL || "openai/gpt-6-luna"), tools: { webSearch: gateway.tools.perplexitySearch({ maxResults: 6, maxTokensPerPage: 900, maxTokens: 5000, country: "HK", searchLanguageFilter: ["en"] }) }, stopWhen: stepCountIs(5), maxOutputTokens: 2500, abortSignal: AbortSignal.timeout(45_000), prompt: `${prompt}\nUse webSearch to check relevant design references and any claimed dimensions. Return ONLY JSON: either {"phase":"ask","question":{"text":"one question","options":["choice"]},"sources":[{"title":"...","url":"https://...","note":"..."}]} or {"phase":"ready","size":{"label":"...","widthPx":2000,"heightPx":1000,"note":"..."},"sources":[]}.` });
      if (!result.steps.some((step) => step.toolCalls.some((call) => call.toolName === "webSearch"))) throw new Error("Design research agent did not use web search.");
      return Decision.parse(parseJson(result.text));
    } catch (error) { if (!process.env.OPENROUTER_API_KEY) throw error; }
  }
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Set AI_GATEWAY_API_KEY or OPENROUTER_API_KEY for free-form design research.");
  let submitted: z.infer<typeof Decision> | undefined;
  const submit = tool({ name: "submit_design_decision", description: "Submit the next question or a fully specified ready size.", inputSchema: z.object({ decision: Decision }), outputSchema: z.object({ accepted: z.boolean() }), execute: async ({ decision }) => { submitted = Decision.parse(decision); return { accepted: true }; } });
  const result = callModel(new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }), { model: process.env.OPENROUTER_MODEL || "qwen/qwen3.6-35b-a3b", input: `${prompt}\nSearch the web for relevant examples or dimensions, then call submit_design_decision.`, tools: [serverTool({ type: "openrouter:web_search", parameters: { maxResults: 8 } }), submit] as const, stopWhen: [hasToolCall("submit_design_decision"), openRouterStepCountIs(8)], doomLoop: true, signal: AbortSignal.timeout(45_000), toolTimeoutMs: 20_000 });
  await result.getText();
  if (!submitted) throw new Error("Design intake did not return a question or a size.");
  return submitted;
}

export async function advanceDesignIntake(projectId: string) {
  const row = projectRow(projectId); if (!row || row.content_type !== "design") throw new Error("Design project not found.");
  if (row.status === "stopped") throw new Error("Design was cancelled.");
  const intake = DesignIntakeSchema.parse(JSON.parse(row.artifact_json ?? "{}"));
  const brand = JSON.parse(row.brand_snapshot_json) as Brand;
  const researchPlan = await planInternetResearch({ type: "design", scope: "design", brief: row.brief, brand, answers: intake.answers });
  recordWorkflowEvent(projectId, "agent", "research-plan", "orchestrator", researchPlan.needed ? `Internet research is needed: ${researchPlan.reason}` : `Internet research is not needed: ${researchPlan.reason}`, researchPlan);
  if (researchPlan.needed) recordWorkflowEvent(projectId, "agent", "research-started", "research", "Design research agent is checking the format and canvas size.");
  const prompt = `You are the intake and format researcher for a company design studio. Brief: ${row.brief}. Brand: ${JSON.stringify(brand)}. Extra instructions: ${intake.instructions}. Reference notes: ${intake.referenceNotes}. Answers so far: ${JSON.stringify(intake.answers)}. Previous sources: ${JSON.stringify(intake.sources)}. Decide what essential information remains to make a useful, correctly sized, on-brand design. Ask ONE concise question at a time; you may ask as many sequential questions as the request needs, but never repeat answered questions or ask for optional trivia. For unfamiliar physical formats, verify standard dimensions and required fields. If there are multiple plausible sizes, offer sourced choices and ask which size; if no dimension can be verified, ask for custom dimensions or a clearly labelled digital-only canvas rather than inventing a standard. For ceremonial cheques, clarify whether it is symbolic or bank-payable if unclear, plus required recipient, amount and event wording. For other formats, adapt questions to the brief. When essential copy, style and size are settled, return ready. Width and height must be output pixels, each <=6000 and total <=20 million pixels; explain physical units and print resolution in size.note if relevant. Only cite source pages actually inspected. Do not fabricate source URLs.`;
  const decision = researchPlan.needed ? await askWithSearch(`${prompt} Research focus: ${researchPlan.focus}.`) : await askWorkflowModel(Decision, `${prompt} The coordinator decided no internet research is needed. Use only the supplied brand, brief, answers, and sources. If a physical size is not supplied, ask for dimensions instead of inventing a standard. Return ONLY JSON with phase ask and one question, or phase ready and a size.`);
  if (decision.phase === "ready" && decision.size.widthPx * decision.size.heightPx > 20_000_000) throw new Error("The selected canvas exceeds 20 megapixels. Choose a smaller render size.");
  const sources = [...new Map([...intake.sources, ...decision.sources].map((source) => [source.url, source])).values()];
  const suppliedSize = `${row.brief} ${intake.answers.map((item) => item.answer).join(" ")}`;
  if (decision.phase === "ready" && /\b(?:cheque|check)\b/i.test(row.brief) && !sources.length && !/\b\d+(?:\.\d+)?\s*(?:mm|cm|inches?|px)\b|\bdigital(?:-only)?\b/i.test(suppliedSize)) {
    const question = { text: "I couldn't verify a suitable presentation-cheque size. What exact dimensions should I use (mm, cm or inches), or should this be digital-only?", options: ["Digital-only canvas"] };
    updateProjectRecord(projectId, { status: "awaiting-input", artifact: { ...intake, question, sources } });
    recordWorkflowEvent(projectId, "assistant", "question", "design", question.text, { options: question.options });
    return question;
  }
  if (decision.phase === "ask") {
    updateProjectRecord(projectId, { status: "awaiting-input", artifact: { ...intake, question: decision.question, sources } });
    recordWorkflowEvent(projectId, "assistant", "question", "design", decision.question.text, { options: decision.question.options, sources });
    return decision.question;
  }
  updateProjectRecord(projectId, { status: "queued", artifact: { ...intake, question: undefined, size: decision.size, sources } });
  recordWorkflowEvent(projectId, "agent", "route", "design", `Using ${decision.size.label} (${decision.size.widthPx} × ${decision.size.heightPx} px).`, { size: decision.size, sources });
  enqueue(projectId, "design-generate");
  return null;
}

export function answerDesignQuestion(projectId: string, answer: string) {
  const row = projectRow(projectId); if (!row || row.content_type !== "design" || row.status !== "awaiting-input") throw new Error("No design question is awaiting an answer.");
  const intake = DesignIntakeSchema.parse(JSON.parse(row.artifact_json ?? "{}"));
  if (!intake.question || !answer.trim() || answer.length > 2000) throw new Error("Enter an answer of 1–2,000 characters.");
  const selected = /^\d+$/.test(answer.trim()) ? intake.question.options[Number(answer.trim()) - 1] : undefined;
  updateProjectRecord(projectId, { status: "clarifying", artifact: { ...intake, question: undefined, answers: [...intake.answers, { question: intake.question.text, answer: selected ?? answer.trim() }] } });
  recordWorkflowEvent(projectId, "user", "answer", "design", selected ?? answer.trim(), { question: intake.question.text });
  enqueue(projectId, "design-clarify");
}

function textMarkup(element: z.infer<typeof TextElement>, width: number, height: number) {
  const x = element.x * width; const y = element.y * height; const fontSize = element.fontSize * width;
  const maxChars = Math.max(4, Math.floor(element.width * width / (fontSize * 0.55)));
  const lines: string[] = []; let current = "";
  for (const word of element.text.split(/\s+/)) { if (current && `${current} ${word}`.length > maxChars) { lines.push(current); current = word; } else current = current ? `${current} ${word}` : word; }
  if (current) lines.push(current);
  const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";
  const textX = element.align === "center" ? x + element.width * width / 2 : element.align === "right" ? x + element.width * width : x;
  const tspans = lines.slice(0, 12).map((line, index) => `<tspan x="${textX}" y="${y + (index + 1) * fontSize * 1.16}">${escape(line)}</tspan>`).join("");
  return `<text text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${element.weight === "bold" ? 700 : 400}" font-style="${element.italic ? "italic" : "normal"}" fill="${element.color}">${tspans}</text>`;
}

export async function saveDesignSpec(projectId: string, input: unknown, expectedVersion?: number, status: "complete" | "qa" | "needs-review" = "complete") {
  const parsed = DesignSpecSchema.parse(input);
  const spec = { ...parsed, elements: parsed.elements.map((element, index) => ({ ...element, id: element.id ?? `element-${index + 1}` })) };
  const row = projectRow(projectId); if (!row || row.content_type !== "design") throw new Error("Design project not found.");
  if (row.status === "stopped") throw new Error("Design was cancelled.");
  if (expectedVersion !== undefined && row.version !== expectedVersion) throw new Error("This design changed in another tab. Refresh before saving.");
  const { widthPx: width, heightPx: height } = spec.size;
  if (width * height > 20_000_000) throw new Error("Canvas must be 20 megapixels or smaller.");
  const brand = JSON.parse(row.brand_snapshot_json) as Brand;
  const componentAssets = spec.elements.filter((element) => element.kind === "component" && element.component.assetPath).map((element) => element.kind === "component" ? element.component.assetPath : "");
  await Promise.all(componentAssets.map((assetPath) => componentIllustrationData(assetPath, row.company_id)));
  const elements = await Promise.all(spec.elements.map(async (element) => {
    if (element.kind === "text") return textMarkup(element, width, height);
    if (element.kind === "image") {
      const reference = element.assetId
        ? db().prepare("SELECT disk_path,media_type FROM assets WHERE id=? AND company_id=?").get(element.assetId ?? "", row.company_id) as { disk_path: string; media_type: string } | undefined
        : db().prepare("SELECT disk_path,media_type FROM project_references WHERE id=? AND project_id=?").get(element.referenceId ?? "", projectId) as { disk_path: string; media_type: string } | undefined;
      if (!reference || !reference.media_type.startsWith("image/")) throw new Error("Image is not available in this project.");
      const metadata = await sharp(reference.disk_path).metadata();
      const sourceWidth = metadata.width ?? 0; const sourceHeight = metadata.height ?? 0;
      const left = Math.round(element.cropX * sourceWidth); const top = Math.round(element.cropY * sourceHeight);
      const cropWidth = Math.min(sourceWidth - left, Math.round(element.cropWidth * sourceWidth));
      const cropHeight = Math.min(sourceHeight - top, Math.round(element.cropHeight * sourceHeight));
      if (cropWidth < 1 || cropHeight < 1) throw new Error("Image crop is outside the image.");
      const cropped = await sharp(reference.disk_path).extract({ left, top, width: cropWidth, height: cropHeight }).png().toBuffer();
      return `<image href="data:image/png;base64,${cropped.toString("base64")}" x="${element.x * width}" y="${element.y * height}" width="${element.width * width}" height="${element.height * height}" preserveAspectRatio="none"/>`;
    }
    if (element.kind === "component") {
      const png = await renderSemanticComponentPng(element.component, brand.colors?.[1] ?? brand.colors?.[0], row.company_id);
      return `<image href="data:image/png;base64,${png.toString("base64")}" x="${element.x * width}" y="${element.y * height}" width="${element.width * width}" height="${element.height * height}" preserveAspectRatio="none"/>`;
    }
    if (element.kind === "rect" || element.kind === "ellipse") {
      const common = `fill="${element.fill}" stroke="${element.stroke ?? "none"}" stroke-width="${element.strokeWidth * width}"`;
      return element.kind === "rect" ? `<rect x="${element.x * width}" y="${element.y * height}" width="${element.width * width}" height="${element.height * height}" ${common}/>` : `<ellipse cx="${(element.x + element.width / 2) * width}" cy="${(element.y + element.height / 2) * height}" rx="${element.width * width / 2}" ry="${element.height * height / 2}" ${common}/>`;
    }
    return `<line x1="${element.x * width}" y1="${element.y * height}" x2="${element.x2 * width}" y2="${element.y2 * height}" stroke="${element.color}" stroke-width="${element.strokeWidth * width}"/>`;
  })).then((parts) => parts.join(""));
  let logo = "";
  if (spec.includeLogo && brand.logoAssetId) {
    const asset = db().prepare("SELECT disk_path,media_type FROM assets WHERE id=? AND company_id=?").get(brand.logoAssetId, row.company_id) as { disk_path: string; media_type: string } | undefined;
    if (asset && asset.media_type === "image/png") logo = `<image href="data:image/png;base64,${(await fs.readFile(asset.disk_path)).toString("base64")}" x="${width * 0.04}" y="${height * 0.04}" width="${width * 0.15}" height="${height * 0.1}" preserveAspectRatio="xMinYMin meet"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${spec.background}"/>${elements}${logo}</svg>`;
  const directory = path.join(companyStorageDir(row.company_id), "projects", projectId);
  await fs.mkdir(directory, { recursive: true });
  const svgPath = path.join(directory, "design.svg"); const imagePath = path.join(directory, "design.png");
  await fs.writeFile(svgPath, svg);
  await sharp(Buffer.from(svg), { limitInputPixels: 20_000_000 }).png().toFile(imagePath);
  return updateProjectRecord(projectId, { status: expectedVersion !== undefined && status === "complete" ? "needs-review" : status, artifact: { ...spec, svgPath, imagePath } }, expectedVersion);
}

export async function generateDesign(projectId: string) {
  const row = projectRow(projectId); if (!row || row.content_type !== "design") throw new Error("Design project not found.");
  const intake = DesignIntakeSchema.parse(JSON.parse(row.artifact_json ?? "{}"));
  if (!intake.size) throw new Error("Design size has not been selected.");
  const brand = JSON.parse(row.brand_snapshot_json) as Brand;
  recordWorkflowEvent(projectId, "agent", "started", "design", "Calling the design specialist to create the editable artwork.");
  const companyReferences = db().prepare("SELECT name,disk_path FROM assets WHERE company_id=? AND category='reference' AND media_type LIKE 'image/%' ORDER BY created_at DESC LIMIT 2")
    .all(row.company_id) as Array<{ name: string; disk_path: string }>;
  const referenceImages = await Promise.all(companyReferences.map(async (reference) => {
    try { return { name: reference.name, bytes: await sharp(reference.disk_path).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer() }; }
    catch { return null; }
  })).then((items) => items.filter((item) => item !== null));
  const visualPlan = await planVisualReferences({ type: "design", brief: row.brief, brand, answers: intake.answers, localReferences: companyReferences.map((item) => item.name) });
  recordWorkflowEvent(projectId, "agent", "visual-plan", "orchestrator", visualPlan.needed ? `Visual reference research is needed: ${visualPlan.reason}` : `Visual reference research is not needed: ${visualPlan.reason}`, visualPlan);
  if (visualPlan.needed) recordWorkflowEvent(projectId, "agent", "visual-started", "visual-reference", "Visual reference agent is inspecting examples for layout and style cues.");
  let visualReferences: Awaited<ReturnType<typeof researchVisualReferences>> | undefined;
  if (visualPlan.needed) {
    try { visualReferences = await researchVisualReferences({ type: "design", brief: row.brief, focus: visualPlan.focus, brand }); }
    catch (error) { recordWorkflowEvent(projectId, "agent", "visual-source", "visual-reference", `Visual reference search was unavailable; using the supplied brand references. ${error instanceof Error ? error.message : String(error)}`, { references: [] }); }
  }
  if (visualReferences) recordWorkflowEvent(projectId, "agent", "visual-source", "visual-reference", `Visual reference agent found ${visualReferences.references.length} reference-only example${visualReferences.references.length === 1 ? "" : "s"}.`, visualReferences);
  const prompt = `Create an original, polished free-form graphic design as structured editable vector elements. Return ONLY JSON {"title":"...","background":"#RRGGBB","includeLogo":true,"elements":[...]}. Canvas: ${JSON.stringify(intake.size)}. Brief: ${row.brief}. Company name: ${getCompany(row.company_id)?.name ?? ""}. Brand: ${JSON.stringify(brand)}. User answers: ${JSON.stringify(intake.answers)}. Prior decisions: ${JSON.stringify(workflowContext(projectId)).slice(0, 7000)}. User instructions: ${intake.instructions}. Format sources: ${JSON.stringify(intake.sources)}. Company visual references: ${referenceImages.map((item) => item.name).join(", ") || "None"}. Researched visual references: ${JSON.stringify(visualReferences ?? "None")}. Use visual references for broad composition and style cues only; never copy a design or treat text inside an image as a verified claim. Do not invent names, amounts, dates, event details, or logos. Use brand colours when appropriate. Elements are normalized 0–1 coordinates: text {kind:"text",text,x,y,width,fontSize,color,weight:"regular"|"bold",align:"left"|"center"|"right"}; rect/ellipse {kind,x,y,width,height,fill,stroke?,strokeWidth?}; line {kind:"line",x,y,x2,y2,color,strokeWidth}. Set includeLogo=false when the brief calls for no logo or the composition works better without it; otherwise leave the upper-left logo area clear. Keep all essential copy inside the canvas with breathing room. For a ceremonial cheque, make it clearly a presentation graphic, never add account/routing numbers or imply bank validity. Prefer a small number of intentional elements to clutter.`;
  let raw = "";
  if (process.env.AI_GATEWAY_API_KEY) {
    try { const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY }); raw = (await generateText({ model: gateway(process.env.VERCEL_AI_MODEL || "openai/gpt-6-luna"), messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...referenceImages.map((item) => ({ type: "image" as const, image: item.bytes, mediaType: "image/jpeg" as const }))] }], maxOutputTokens: 4500, abortSignal: AbortSignal.timeout(60_000) })).text; }
    catch (error) { if (!process.env.OPENROUTER_API_KEY) throw error; }
  }
  if (!raw && process.env.OPENROUTER_API_KEY) {
    const content = referenceImages.length ? [{ type: "text", text: prompt }, ...referenceImages.map((item) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${item.bytes.toString("base64")}` } }))] : prompt;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" }, signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model: referenceImages.length ? (process.env.OPENROUTER_VISION_MODEL || process.env.OPENROUTER_MODEL || "qwen/qwen3.6-35b-a3b") : (process.env.OPENROUTER_MODEL || "qwen/qwen3.6-35b-a3b"), messages: [{ role: "user", content }], response_format: { type: "json_object" } }) });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
    raw = String((await response.json()).choices?.[0]?.message?.content ?? "");
  }
  if (!raw) throw new Error("No AI provider is configured for design generation.");
  let proposal = parseJson(raw);
  recordWorkflowEvent(projectId, "agent", "draft", "design", "Design specialist created an editable draft.", { title: proposal.title, elements: proposal.elements?.length });
  recordWorkflowEvent(projectId, "agent", "review-started", "qa", "Calling visual and export QA agents.");
  for (let pass = 1; pass <= 3; pass += 1) {
    const saved = await saveDesignSpec(projectId, { type: "design", ...proposal, size: intake.size, sources: intake.sources, visualReferences }, undefined, "qa");
    const spec = DesignSpecSchema.parse(JSON.parse(saved.artifact_json!));
    const report = await reviewDesignVisual(spec, row.brief, brand).catch((error) => ({ passed: false, issues: [error instanceof Error ? error.message : String(error)], summary: "Visual QA could not run." }));
    recordWorkflowQa(projectId, "design-visual-export", report.passed, report, saved.version);
    if (report.passed) {
      const completed = updateProjectRecord(projectId, { status: "complete" });
      recordWorkflowEvent(projectId, "assistant", "complete", "design", "Your design is ready. I checked the rendered image and exports.");
      const state = workflowState(projectId); if (state) saveWorkflowState({ ...state, phase: "complete" });
      return completed;
    }
    if (pass === 3) {
      const needsReview = updateProjectRecord(projectId, { status: "needs-review" });
      recordWorkflowEvent(projectId, "assistant", "quality", "design", `The design needs review: ${report.issues.join(" ").slice(0, 450)}`);
      const state = workflowState(projectId); if (state) saveWorkflowState({ ...state, phase: "review" });
      return needsReview;
    }
    try {
      proposal = await askWorkflowModel(DesignSpecSchema.omit({ type: true, size: true, sources: true, visualReferences: true, svgPath: true, imagePath: true }), `Repair this editable graphic design based on independent QA. Return ONLY a full JSON design proposal with title, background, includeLogo and elements. Preserve supplied names, dates and amounts; do not invent facts or assets. Brief: ${JSON.stringify(row.brief)}. Canvas: ${JSON.stringify(intake.size)}. Current: ${JSON.stringify(spec).slice(0, 17000)}. Issues: ${JSON.stringify(report.issues)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const needsReview = updateProjectRecord(projectId, { status: "needs-review" });
      recordWorkflowEvent(projectId, "assistant", "quality", "design", `The design needs review: ${report.issues.join(" ").slice(0, 350)} Repair could not be applied: ${message.slice(0, 160)}`);
      const state = workflowState(projectId); if (state) saveWorkflowState({ ...state, phase: "review" });
      return needsReview;
    }
  }
  throw new Error("Design review ended unexpectedly.");
}

export async function reviewSavedDesign(projectId: string) {
  const row = projectRow(projectId); if (!row?.artifact_json || row.content_type !== "design") throw new Error("Design not found.");
  const spec = DesignSpecSchema.parse(JSON.parse(row.artifact_json));
  const report = await reviewDesignVisual(spec, row.brief, JSON.parse(row.brand_snapshot_json)).catch((error) => ({ passed: false, issues: [error instanceof Error ? error.message : String(error)], summary: "Visual QA could not run." }));
  if (projectRow(projectId)?.version !== row.version) return false;
  recordWorkflowQa(projectId, "design-visual-export", report.passed, report, row.version);
  updateProjectRecord(projectId, { status: report.passed ? "complete" : "needs-review" }, row.version);
  recordWorkflowEvent(projectId, "assistant", report.passed ? "complete" : "quality", "design", report.passed ? "Your design changes passed QA." : `Design changes need review: ${report.issues.join(" ").slice(0, 450)}`);
  return true;
}
