/** Local, model-free fixtures for inspecting every exported format across distinct brands. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { SimpleArtifactSchema } from "./lib/simple-content";
import { renderModernArtifact } from "./lib/modern-content";
import type { ContentBrand } from "./lib/content-brand";

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.tmpdir(), "ola-content-fixtures");
await fs.mkdir(root, { recursive: true });
const logoPath = path.join(root, "cedar-logo.svg");
const artworkPath = path.join(root, "cedar-book.svg");
await fs.writeFile(logoPath, '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100" viewBox="0 0 360 100"><rect x="5" y="10" width="75" height="75" rx="14" fill="#1C6746"/><path d="M24 56l18-28 18 28M33 48h18" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><text x="98" y="69" font-family="Arial" font-weight="700" font-size="42" fill="#142A20">CEDAR</text></svg>');
await fs.writeFile(artworkPath, '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect x="110" y="92" width="420" height="456" rx="32" fill="#DFEFE4"/><path d="M320 192c-72-45-138-39-185-18v247c67-15 122-10 185 24 63-34 118-39 185-24V174c-47-21-113-27-185 18z" fill="white" stroke="#1C6746" stroke-width="20" stroke-linejoin="round"/><path d="M320 192v253M177 242c44-10 77-4 106 11M177 290c44-10 77-4 106 11M357 253c29-15 62-21 106-11M357 301c29-15 62-21 106-11" fill="none" stroke="#66A37C" stroke-width="16" stroke-linecap="round"/></svg>');

const rich: ContentBrand = {
  companyId: "cedar-fixture", name: "Cedar Learning", audience: "Secondary school students", voice: "Useful and confident", description: "A study platform",
  typography: "Bold sans serif titles; generous leading", imagery: "Simple book illustrations", formatRules: "Lead with a concrete action", examples: [],
  palette: { background: "#F4F9F5", alternate: "#E2F0E6", accent: "#1C6746", ink: "#142A20", dark: "#142A20" },
  logo: { id: "cedar-logo", name: "cedar-logo.svg", mediaType: "image/svg+xml", diskPath: logoPath, role: "primary" },
  assets: [{ id: "cedar-book", name: "cedar-book.svg", mediaType: "image/svg+xml", diskPath: artworkPath, role: "primary" }],
};
const sparse: ContentBrand = { ...rich, companyId: "plain-fixture", name: "Plain Co", logo: undefined, assets: [], imagery: "No supplied artwork", palette: { background: "#F5F4F0", alternate: "#FFFFFF", accent: "#416B85", ink: "#172632", dark: "#172632" } };
const fixtures = [
  { type: "post", headline: "Start with one question", subline: "Check your answer, then choose the next step.", caption: "Choose one practice question. After marking it, write down exactly what to fix.", layout: "split", assetId: "cedar-book" },
  { type: "story", headline: "Turn one wrong answer into a next step", subline: "Write down the exact point where your reasoning changed direction.", cta: "Save this tip", storyTreatment: "quick-tip", layout: "statement", assetId: "cedar-book" },
  { type: "carousel", title: "Turn a mistake into progress", caption: "One wrong answer can point to a useful next task.", slides: [
    { title: "A wrong answer is a clue", body: "Find the exact step where your reasoning changed direction.", layout: "hero", assetId: "cedar-book" },
    { title: "Name the error", body: "Was the idea missing? Did you misread the task? Did time run out?", layout: "steps" },
    { title: "Write one fix", body: "If you misread the command word, underline it before your next answer.", layout: "split", assetId: "cedar-book" },
    { title: "Try a similar question", body: "Apply the fix immediately, then mark your reasoning again.", layout: "diagram" },
    { title: "Check it next week", body: "Use a fresh question to see whether the fix held.", layout: "closing" },
  ] },
  { type: "presentation", title: "A realistic study week", slides: [
    { title: "Plan for the week you have", body: "Choose one priority and protect a short practice block.", layout: "hero", assetId: "cedar-book" },
    { title: "Pick the next topic", body: "Check what is due. Spot the hardest gap. Choose one task.", layout: "steps" },
    { title: "Put practice on the calendar", body: "Reserve a time you can actually keep, then choose the question in advance.", layout: "split", assetId: "cedar-book" },
    { title: "Review your mistakes", body: "Record the error. Write the fix. Try a similar question.", layout: "diagram" },
    { title: "Adjust without starting over", body: "Move unfinished work into the next realistic slot.", layout: "closing" },
  ] },
  { type: "article", title: "Build a useful error log", sections: [
    { title: "Keep only what helps the next attempt", body: "After marking a question, record the topic, your answer, the point where it went wrong, and one action for the next attempt." },
    { title: "A worked example", body: "Question: Explain one effect of a price ceiling. Suppose you described a price floor instead. Diagnosis: you confused the two terms, rather than lacking the whole topic. Next action: draw both diagrams side by side, label the ceiling and floor, then answer a second question without notes." },
    { title: "Check the fix", body: "Return to a similar question later. If you can identify the policy and explain the effect correctly, mark the error as resolved. If not, make the next action smaller and try again." },
  ] },
] as const;

for (const [label, brand] of [["supplied-brand", rich], ["sparse-brand", sparse]] as const) {
  for (const input of fixtures) {
    const artifact = SimpleArtifactSchema.parse({ ...input, designVersion: 2 });
    const output = path.join(root, label, artifact.type);
    await renderModernArtifact(artifact, brand, output);
    console.log(`${label}/${artifact.type}: ${output}`);
  }
  for (const [treatment, copy] of Object.entries({
    "quick-tip": { headline: "Name the error, then choose one fix", subline: "After marking one question, write the step to change next time.", cta: "Save this tip" },
    announcement: { headline: "Free study clinic", subline: "22 October 2026 · 18:00 HKT · for secondary students", cta: "Save your place" },
    "image-showcase": { headline: "A clearer way to study", subline: "Take one question and work through the mistake.", cta: "See the idea" },
    "conversation-prompt": { headline: "Which part of revision takes you longest?", subline: "Tell us what slows you down.", cta: "Reply with yours" },
  })) {
    const artifact = SimpleArtifactSchema.parse({ type: "story", storyTreatment: treatment, ...copy, ...(treatment === "image-showcase" && label === "supplied-brand" ? { assetId: "cedar-book" } : {}), designVersion: 2 });
    const output = path.join(root, label, `story-${treatment}`);
    await renderModernArtifact(artifact, brand, output);
    console.log(`${label}/story-${treatment}: ${output}`);
  }
}
