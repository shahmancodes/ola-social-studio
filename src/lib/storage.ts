import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECTS_DIR, assertSafeId, projectDir } from "./paths";
import { createProjectRecord, listCompanyProjects } from "./platform";
import { db, projectRow } from "./platform-db";
import { ContentFormatSchema, ProjectSchema, SlideCountSchema, ToneSchema, VisualFormatSchema, type ContentFormat, type Project, type ProjectLogSchema, type Tone, type VisualFormat } from "./schemas";

const projectWrites = new Map<string, Promise<void>>();

export class ProjectStoppedError extends Error {
  constructor() { super("This pipeline was stopped."); }
}

async function withProjectWrite<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = projectWrites.get(id) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  projectWrites.set(id, next);
  await previous;
  try { return await task(); }
  finally {
    release();
    if (projectWrites.get(id) === next) projectWrites.delete(id);
  }
}

export async function ensureStorage() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 42);
}

export async function createProject(input: {
  id?: string;
  companyId?: string;
  creatorId?: string;
  brief: string;
  contentFormat?: ContentFormat;
  tone?: Tone;
  visualFormat?: VisualFormat;
  slideCount?: number | null;
  includeBrandClose?: boolean;
  additionalInstructions?: string;
  sourceNotes?: string;
  sourceUrls?: string[];
}): Promise<Project> {
  await ensureStorage();
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const id = input.id ?? `${slugify(input.brief) || "carousel"}-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
  if (input.companyId && !projectRow(id)) createProjectRecord({ id, companyId: input.companyId, creatorId: input.creatorId, contentType: "carousel", brief: input.brief });
  const now = new Date().toISOString();
  const project = ProjectSchema.parse({
    id,
    title: input.brief.slice(0, 72),
    brief: input.brief,
    contentFormat: ContentFormatSchema.parse(input.contentFormat ?? "guide"),
    tone: ToneSchema.parse(input.tone ?? "playful"),
    visualFormat: VisualFormatSchema.parse(input.visualFormat ?? "auto"),
    slideCount: SlideCountSchema.parse(input.slideCount ?? null),
    includeBrandClose: input.includeBrandClose ?? false,
    additionalInstructions: input.additionalInstructions ?? "",
    sourceNotes: input.sourceNotes ?? "",
    sourceUrls: input.sourceUrls ?? [],
    screenshotPaths: [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
    concepts: [],
    sourceRiskAccepted: false,
    renderPaths: [],
    qaReports: [],
    qaPasses: 0,
    logs: [{ at: now, kind: "info", message: "Project created." }],
    demoMode: !process.env.AI_GATEWAY_API_KEY && !process.env.OPENROUTER_API_KEY,
    providerFallbacks: [],
  });
  await fs.mkdir(path.join(projectDir(id), "inputs"), { recursive: true });
  await fs.mkdir(path.join(projectDir(id), "renders"), { recursive: true });
  await saveProject(project);
  return project;
}

async function writeProject(project: Project) {
  assertSafeId(project.id);
  const parsed = ProjectSchema.parse({ ...project, updatedAt: new Date().toISOString() });
  await fs.mkdir(projectDir(project.id), { recursive: true });
  const target = path.join(projectDir(project.id), "project.json");
  const temp = `${target}.tmp-${crypto.randomBytes(4).toString("hex")}`;
  await fs.writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  if (projectRow(project.id)) {
    const { db } = await import("./platform-db");
    db().prepare("UPDATE projects SET status=?,brief=?,updated_at=?,version=version+1 WHERE id=?").run(parsed.status, parsed.brief, parsed.updatedAt, project.id);
  }
  return parsed;
}

export async function saveProject(project: Project) {
  return withProjectWrite(project.id, async () => {
    try {
      const current = await loadProject(project.id);
      if (current.status === "stopped" && project.status !== "stopped") throw new ProjectStoppedError();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return writeProject(project);
  });
}

export async function updateProjectAtomically(id: string, update: (project: Project) => Project) {
  assertSafeId(id);
  return withProjectWrite(id, async () => writeProject(update(await loadProject(id))));
}

export async function loadProject(id: string): Promise<Project> {
  assertSafeId(id);
  const raw = await fs.readFile(path.join(projectDir(id), "project.json"), "utf8");
  return ProjectSchema.parse(JSON.parse(raw));
}

export async function listProjects(companyId?: string): Promise<Project[]> {
  if (companyId) {
    const rows = listCompanyProjects(companyId).filter((row) => row.content_type === "carousel" && !row.artifact_json);
    const projects = await Promise.all(rows.map((row) => loadProject(row.id).catch(() => null)));
    return projects.filter((project): project is Project => Boolean(project));
  }
  await ensureStorage();
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const managedIds = (db().prepare("SELECT id FROM projects WHERE content_type='carousel'").all() as Array<{ id: string }>).map((row) => row.id);
  const ids = [...new Set([...entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name), ...managedIds])];
  const projects = await Promise.all(
    ids.map(async (id) => {
      try {
        return await loadProject(id);
      } catch {
        return null;
      }
    }),
  );
  return projects
    .filter((project): project is Project => Boolean(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function addLog(
  project: Project,
  kind: "info" | "agent" | "tool" | "warning" | "error" | "approval",
  message: string,
) {
  project.logs.push({ at: new Date().toISOString(), kind, message });
  project.logs = project.logs.slice(-200);
}

export async function saveInputFile(project: Project, name: string, bytes: Buffer) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = path.join(projectDir(project.id), "inputs", `${Date.now()}-${safeName}`);
  await fs.writeFile(target, bytes);
  project.screenshotPaths.push(target);
  return target;
}
