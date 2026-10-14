/** Six isolated, provider-backed Instagram release cases. Results are left in a temporary directory for visual review. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ola-social-live-"));
process.chdir(root);

const { createUser } = await import("./lib/platform-auth");
const { createCompany, getBrand, saveBrand, storeCompanyAsset } = await import("./lib/platform");
const { db, projectRow } = await import("./lib/platform-db");
const { createIntakeRequest } = await import("./lib/intake");
const { runOneJob } = await import("./worker");
const { workflowEvents } = await import("./lib/workflow-state");

const owner = createUser("social-live-fixtures@example.invalid", "social-live-fixture-password-2026");
const northstar = createCompany("Northstar Learning", owner, { audience: "Secondary students", voice: "Clear, useful and student-friendly", colors: ["#6A40D5", "#FAF7FF", "#21163D"], formatRules: "Use confirmed facts and a concrete student action." });
const cedar = createCompany("Cedar Learning", owner, { audience: "Secondary students", voice: "Clear, useful and encouraging", colors: ["#1C6746", "#F4F9F5", "#142A20"], formatRules: "Lead with a concrete student action." });
const plain = createCompany("Plain Co", owner, { audience: "Students", voice: "Plain, direct", colors: ["#416B85", "#F5F4F0", "#172632"], formatRules: "Use only facts in the brief." });
const cedarLogo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100" viewBox="0 0 360 100"><rect x="5" y="10" width="75" height="75" rx="14" fill="#1C6746"/><text x="105" y="68" font-family="Arial" font-size="42" font-weight="700" fill="#142A20">CEDAR</text></svg>');
const logoId = await storeCompanyAsset(cedar, "Cedar Learning logo", cedarLogo, "image/svg+xml", "logo");
saveBrand(cedar, { ...getBrand(cedar), logoAssetId: logoId });

const cases = [
  { name: "story-northstar", companyId: northstar, brief: "Create one Instagram Story for secondary students with one useful action to take after getting a practice question wrong. Make it worth saving; avoid unsupported product claims." },
  { name: "story-cedar", companyId: cedar, brief: "Announce a fictional free study clinic on 22 October 2026 at 18:00 HKT for secondary students. Include the time and a clear ‘Save your place’ CTA. Create one Instagram Story." },
  { name: "story-plain", companyId: plain, brief: "Ask students which part of revision takes them longest and invite a reply. Make one bold, readable Instagram Story without photos or a fake poll sticker." },
  { name: "carousel-northstar", companyId: northstar, brief: "Make a six-slide Instagram carousel explaining how secondary students can turn feedback on one practice answer into their next revision task. Verify any curriculum-specific claims against official sources." },
  { name: "carousel-cedar", companyId: cedar, brief: "Make a five-slide Instagram carousel showing how to diagnose one wrong answer, choose one fix, and test it on a similar question. Include a worked example." },
  { name: "carousel-plain", companyId: plain, brief: "For fictional Plain Co, make a six-slide launch carousel for a free worksheet library. The only confirmed facts are that it is free and contains downloadable practice worksheets. Do not invent subjects, results, or a launch date." },
];

const results: Array<Record<string, unknown>> = [];
for (const item of cases) {
  const id = createIntakeRequest(item.companyId, owner, item.brief);
  const started = Date.now();
  for (let step = 0; step < 12; step += 1) {
    const row = projectRow(id)!;
    if (["complete", "needs-review", "failed", "awaiting-input", "coming-soon"].includes(row.status)) break;
    const ran = await runOneJob();
    if (!ran) break;
  }
  const row = projectRow(id)!;
  let imagePaths: string[] = [];
  let quality: unknown = null;
  if (row.artifact_json) {
    const artifact = JSON.parse(row.artifact_json);
    imagePaths = artifact.type === "story" ? [artifact.imagePath].filter(Boolean) : artifact.type === "carousel" ? artifact.imagePaths ?? [] : [];
    quality = artifact.quality ?? null;
  }
  const contact: Buffer[] = [];
  for (const file of imagePaths) contact.push(await sharp(file).resize({ width: 216 }).png().toBuffer());
  const contactPath = path.join(root, `${item.name}-contact.png`);
  if (contact.length) {
    const meta = await sharp(contact[0]).metadata();
    await sharp({ create: { width: 216 * contact.length, height: meta.height ?? 270, channels: 4, background: "#ffffff" } }).composite(contact.map((input, index) => ({ input, left: index * 216, top: 0 }))).png().toFile(contactPath);
  }
  const result = { name: item.name, id, status: row.status, durationMs: Date.now() - started, imagePaths, contactPath: contact.length ? contactPath : null, quality, metrics: workflowEvents(id).filter((event) => event.kind === "run-metrics").map((event) => event.data), events: workflowEvents(id).filter((event) => ["question", "quality", "complete", "qa-failed"].includes(event.kind)).map((event) => ({ kind: event.kind, body: event.body })) };
  results.push(result);
  await fs.writeFile(path.join(root, "results.json"), JSON.stringify(results, null, 2));
  process.stdout.write(`${item.name}: ${row.status}; ${imagePaths.length} images; ${(Date.now() - started) / 1000}s\n`);
}
process.stdout.write(`Results: ${path.join(root, "results.json")}\n`);
db().close();
