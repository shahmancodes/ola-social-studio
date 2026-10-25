import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "draft",
  "researching",
  "concept_review",
  "storyboarding",
  "storyboard_review",
  "rendering",
  "qa",
  "complete",
  "failed",
  "stopped",
]);

export const ContentFormatSchema = z.enum([
  "guide",
  "meme",
  "announcement",
  "social-proof",
]);

export const ToneSchema = z.enum([
  "playful",
  "auto",
  "calm",
  "direct",
  "dry-humour",
]);

export const VisualSystemFamilySchema = z.enum([
  "stacked-editorial",
  "split-left",
  "alternating-split",
  "text-led",
  "meme-stage",
]);

export const VisualFormatSchema = z.union([z.literal("auto"), VisualSystemFamilySchema]);

export const RendererCapabilitySchema = z.enum([
  // Legacy saved concepts may contain this value. New concepts must use
  // SupportedRendererCapabilitySchema below because split frames are disabled.
  "split-frame",
  "independent-text-blocks",
  "basic-primitives",
  "anchored-bubbles",
  "layer-ordering",
  "semantic-components",
]);

export const SupportedRendererCapabilitySchema = RendererCapabilitySchema.exclude(["split-frame"]);

export const SlideCountSchema = z.number().int().min(3).max(9).nullable();

export function requestedCarouselLength(project: { slideCount: number | null; includeBrandClose: boolean }) {
  return project.slideCount === null ? null : project.slideCount + (project.includeBrandClose ? 1 : 0);
}

export const SourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  note: z.string().min(1),
  publisher: z.string().optional(),
  accessedAt: z.string(),
});

export const ResearchDossierSchema = z.object({
  summary: z.string().min(1),
  verifiedFacts: z.array(z.string()).min(1),
  openQuestions: z.array(z.string()),
  sources: z.array(SourceSchema),
  needsSourceNotes: z.boolean().default(false),
});

export const VisualReferenceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  sourceType: z.enum(["company", "platform-trend", "editorial-reference", "product-ui"]),
  observedPattern: z.string().min(1),
  relevance: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  usage: z.literal("reference-only"),
  accessedAt: z.string(),
});

export const VisualReferenceDossierSchema = z.object({
  summary: z.string().min(1),
  layoutPatterns: z.array(z.string()).min(1).max(8),
  toneAndPacing: z.array(z.string()).max(8),
  avoid: z.array(z.string()).max(8),
  references: z.array(VisualReferenceSchema).max(10),
});

// Vercel AI Gateway rejects JSON Schema's `format: "uri"`. Keep its provider
// contract format-free, then parse the returned value with
// VisualReferenceDossierSchema so invalid URLs still fail application validation.
export const VercelVisualReferenceDossierSchema = VisualReferenceDossierSchema.extend({
  references: z.array(VisualReferenceSchema.extend({ url: z.string().min(1) })).max(10),
});

export const InternetAssetCandidateSchema = z.object({
  title: z.string().min(1),
  sourcePageUrl: z.string().url(),
  assetUrl: z.string().url(),
  publisher: z.string().min(1),
  recommendedRole: z.enum(["primary", "supporting"]),
  canReplaceMascot: z.boolean(),
  visualFit: z.string().min(1),
  usageRights: z.enum(["first-party-company", "public-domain", "creative-commons", "permission-required"]),
  rightsEvidence: z.string().min(1),
  attribution: z.string(),
  accessedAt: z.string(),
});

export const GeneratedInternetAssetDossierSchema = z.object({
  summary: z.string().min(1),
  assets: z.array(InternetAssetCandidateSchema).max(6),
});

// Vercel rejects JSON Schema's URI format. Provider output is format-free and
// is validated against GeneratedInternetAssetDossierSchema immediately after.
export const VercelInternetAssetDossierSchema = GeneratedInternetAssetDossierSchema.extend({
  assets: z.array(InternetAssetCandidateSchema.extend({
    sourcePageUrl: z.string().min(1),
    assetUrl: z.string().min(1),
  })).max(6),
});

export const SourcedInternetAssetSchema = InternetAssetCandidateSchema.extend({
  status: z.enum(["downloaded", "skipped", "failed"]),
  localPath: z.string().optional(),
  error: z.string().optional(),
});

export const InternetAssetDossierSchema = z.object({
  summary: z.string().min(1),
  assets: z.array(SourcedInternetAssetSchema).max(6),
});

export const ConceptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hook: z.string().min(1),
  angle: z.string().min(1),
  visualTreatment: z.string().min(1),
  visualFormat: VisualSystemFamilySchema.default("split-left"),
  requiredCapabilities: z.array(RendererCapabilitySchema).max(5).default([]),
  slideOutline: z.array(z.string()).min(3).max(10),
  cta: z.string().min(1),
});

// AI providers with strict structured outputs require every declared property
// to be required. ConceptSchema keeps a default for loading older saved projects;
// generated concepts must always provide their chosen visual system explicitly.
export const GeneratedConceptSchema = ConceptSchema.extend({
  visualFormat: VisualSystemFamilySchema,
  requiredCapabilities: z.array(SupportedRendererCapabilitySchema).max(5),
});

export const SlideLayoutSchema = z.enum([
  "hero",
  "editorial",
  "split",
  "cards",
  "quote",
  "cta",
]);

export const AssetPlacementSchema = z.enum([
  "lower-left",
  "lower-center",
  "lower-right",
  "left-center",
  "right-center",
  "background",
]);

export const CalloutPlacementSchema = z.enum([
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "middle-left",
  "middle-right",
  "footer",
]);

export const CalloutStyleSchema = z.enum(["box", "speech", "thought", "plain"]);

export const SupportingPlacementSchema = z.enum([
  "upper-right",
  "middle-left",
  "middle-right",
  "lower-left",
  "lower-right",
]);

export const BadgeSchema = z.object({
  text: z.string().min(1).max(24),
  position: z.enum(["above-heading", "beside-heading", "lower-left", "lower-right"]).default("above-heading"),
  style: z.enum(["solid", "outline", "slash"]).default("solid"),
});

const EditorLayerOverrideSchema = z.object({
  x: z.number().min(0).max(96).optional(),
  y: z.number().min(0).max(96).optional(),
  rotation: z.number().min(-180).max(180).optional(),
  scale: z.number().min(0.25).max(3).optional(),
  zIndex: z.number().int().min(0).max(20).optional(),
  hidden: z.boolean().default(false),
});

const SlideEditorSchema = z.object({
  logo: EditorLayerOverrideSchema.optional(),
  counter: EditorLayerOverrideSchema.optional(),
  footer: EditorLayerOverrideSchema.optional(),
  content: EditorLayerOverrideSchema.optional(),
  asset: EditorLayerOverrideSchema.optional(),
  supporting: EditorLayerOverrideSchema.optional(),
  callout: EditorLayerOverrideSchema.optional(),
  badge: EditorLayerOverrideSchema.optional(),
  semantic: EditorLayerOverrideSchema.optional(),
  splitFrame: EditorLayerOverrideSchema.optional(),
  textBlock1: EditorLayerOverrideSchema.optional(),
  textBlock2: EditorLayerOverrideSchema.optional(),
  textBlock3: EditorLayerOverrideSchema.optional(),
  primitive1: EditorLayerOverrideSchema.optional(),
  primitive2: EditorLayerOverrideSchema.optional(),
  primitive3: EditorLayerOverrideSchema.optional(),
  addedAsset1: EditorLayerOverrideSchema.optional(),
  addedAsset2: EditorLayerOverrideSchema.optional(),
  addedAsset3: EditorLayerOverrideSchema.optional(),
  addedAsset4: EditorLayerOverrideSchema.optional(),
  addedAsset5: EditorLayerOverrideSchema.optional(),
  addedAsset6: EditorLayerOverrideSchema.optional(),
  addedAsset7: EditorLayerOverrideSchema.optional(),
  addedAsset8: EditorLayerOverrideSchema.optional(),
});

export const AddedAssetSchema = z.object({
  id: z.enum(["addedAsset1", "addedAsset2", "addedAsset3", "addedAsset4", "addedAsset5", "addedAsset6", "addedAsset7", "addedAsset8"]),
  path: z.string().min(1),
  x: z.number().min(0).max(96),
  y: z.number().min(0).max(96),
  size: z.number().min(6).max(70),
  opacity: z.number().min(0.05).max(1).default(1),
  zIndex: z.number().int().min(0).max(20).default(2),
});

export const SplitFrameSchema = z.object({
  orientation: z.enum(["vertical", "horizontal", "diagonal"]),
  ratio: z.number().min(25).max(75).default(50),
  firstColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  firstText: z.string().max(120).optional(),
  secondText: z.string().max(120).optional(),
  firstTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#07070A"),
  secondTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#07070A"),
});

export const ExtraTextBlockSchema = z.object({
  id: z.enum(["textBlock1", "textBlock2", "textBlock3"]),
  text: z.string().min(1).max(240),
  x: z.number().min(0).max(90),
  y: z.number().min(0).max(92),
  width: z.number().min(10).max(90),
  style: z.enum(["headline", "body", "annotation"]).default("body"),
  align: z.enum(["left", "center", "right"]).default("left"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#07070A"),
  fontSize: z.number().min(18).max(100).default(36),
  weight: z.number().int().min(300).max(900).default(500),
  rotation: z.number().min(-180).max(180).default(0),
  zIndex: z.number().int().min(0).max(20).default(4),
});

export const PrimitiveSchema = z.object({
  id: z.enum(["primitive1", "primitive2", "primitive3"]),
  kind: z.enum(["rectangle", "circle", "line", "arrow"]),
  x: z.number().min(0).max(96),
  y: z.number().min(0).max(96),
  width: z.number().min(2).max(100),
  height: z.number().min(1).max(100),
  fill: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  stroke: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#07070A"),
  strokeWidth: z.number().min(0).max(12).default(2),
  opacity: z.number().min(0.05).max(1).default(1),
  radius: z.number().min(0).max(100).default(0),
  rotation: z.number().min(-180).max(180).default(0),
  zIndex: z.number().int().min(0).max(20).default(1),
});

export const SemanticComponentKindSchema = z.enum([
  "processLoop", "decisionTree", "checklist", "comparison",
  "timeline", "chatExchange", "annotatedExample", "scoreBreakdown",
  "progress", "metricSpotlight", "pullQuote", "labeledVisual",
  "priorityStack", "continuum", "barChart", "lineChart",
  "stackedBar", "scatterPlot", "histogram",
  "pieChart", "hierarchyPyramid", "hubSpoke", "conversionFunnel",
  "waterfall", "quadrant", "venn", "calendarHeatmap", "swimlane",
  "proportionalFlow", "marketSizing", "processSteps", "metricGrid", "bulletChart", "relatedPair",
]);

const SemanticComponentStyleSchema = z.object({
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#07070A"),
  muted: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#53535C"),
  line: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#D7D7DC"),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7F22FE"),
  seriesTwo: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#9599A6"),
  seriesThree: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#C9CBD2"),
  seriesFour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#467640"),
  seriesFive: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#9B4874"),
  onAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  fontFamily: z.enum(["manrope", "poppins", "system", "serif"]).default("manrope"),
  headingFontFamily: z.enum(["manrope", "poppins", "system", "serif"]).nullable().default(null),
  quoteFontFamily: z.enum(["manrope", "poppins", "system", "serif"]).default("serif"),
});

export const SemanticComponentSchema = z.object({
  kind: SemanticComponentKindSchema,
  prompt: z.string().max(130).default(""),
  answer: z.string().max(260).default(""),
  leftTitle: z.string().max(36).default(""),
  rightTitle: z.string().max(36).default(""),
  takeaway: z.string().max(160).default(""),
  note: z.string().max(130).default(""),
  unit: z.string().max(20).default(""),
  activeIndex: z.number().int().min(0).max(11).default(0),
  assetPath: z.string().max(300).default(""),
  chartStyle: z.enum(["pie", "donut"]).default("pie"),
  style: SemanticComponentStyleSchema.nullable().default(null),
  items: z.array(z.object({
    label: z.string().min(1).max(72),
    detail: z.string().max(140).default(""),
    tag: z.string().max(20).default(""),
    speaker: z.enum(["student", "mascot"]).default("student"),
    value: z.number().finite().min(-1_000_000).max(1_000_000_000_000).default(0),
    value2: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
    value3: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
    x: z.number().min(0).max(100).default(50),
    y: z.number().min(0).max(100).default(50),
    radius: z.number().min(6).max(32).default(14),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
    group: z.enum(["source", "destination"]).default("source"),
  })).min(1).max(42),
}).superRefine((component, context) => {
  const count = component.items.length;
  const issue = (message: string, path: (string | number)[] = ["items"]) => context.addIssue({ code: "custom", path, message });
  if (component.kind === "relatedPair" && count !== 2) issue("Related pairs need exactly two complementary ideas.");
  if (["processSteps", "metricGrid", "bulletChart"].includes(component.kind) && (count < 2 || count > 4)) issue("This component needs 2–4 items.");
  if (component.kind === "bulletChart" && component.items.some(item => item.value < 0 || item.value2 <= 0)) issue("Target charts need nonnegative actual values and positive targets.");
  if (component.kind === "histogram" && component.items.some(item => item.value < 0)) issue("Histogram frequencies cannot be negative.");
  if (component.kind === "stackedBar" && component.items.some(item => item.value < 0 || item.value2 < 0 || item.value3 < 0)) issue("Parts of a whole cannot be negative.");
  if (component.kind !== "calendarHeatmap" && count > 12) issue("This component supports at most 12 items.");
  if (component.kind !== "marketSizing" && component.items.some((item) => item.value > 1_000_000)) issue("Values must be at most 1,000,000 outside market sizing.");
  if (["pieChart", "hierarchyPyramid"].includes(component.kind) && (count < 3 || count > 5)) issue("This component needs 3–5 items.");
  if (component.kind === "pieChart" && (component.items.some((item) => item.value <= 0) || component.items.reduce((sum, item) => sum + item.value, 0) <= 0)) issue("Pie slices must have positive values; percentages are calculated from their total.");
  if (component.kind === "pieChart" && component.unit === "%" && Math.abs(component.items.reduce((sum, item) => sum + item.value, 0) - 100) > 1e-8) issue("Percentage values must sum to 100. Otherwise use counts or weights without a % unit.");
  if (component.kind === "hubSpoke" && (count < 2 || count > 4)) issue("Hub and spoke needs 2–4 peers.");
  if (component.kind === "hubSpoke" && !component.prompt.trim()) issue("The hub needs a central idea.", ["prompt"]);
  if (component.kind === "conversionFunnel" && (count < 3 || count > 5 || component.items.some((item, index) => item.value < 0 || (index === 0 ? item.value <= 0 : item.value > component.items[index - 1].value)))) issue("Funnels need 3–5 non-increasing, nonnegative counts and a positive opening count.");
  if (component.kind === "waterfall" && (count < 3 || count > 7)) issue("Waterfalls need an opening, 1–5 signed changes, and a closing total.");
  if (component.kind === "waterfall") {
    const total = component.items.slice(0, -1).reduce((sum, item) => sum + item.value, 0);
    if (Math.abs(total - component.items[count - 1].value) > Math.max(1, Math.abs(total)) * 1e-8) issue("Closing total must equal the opening value plus all signed changes.");
  }
  if (component.kind === "quadrant" && (count < 2 || count > 8)) issue("Quadrants need 2–8 points.");
  if (component.kind === "venn" && count !== 3) issue("Set overlap needs left, right, and shared regions.");
  if (component.kind === "calendarHeatmap") {
    const cells = component.items.map((item) => `${item.x}:${item.y}`);
    if (component.items.some((item) => !Number.isInteger(item.x) || item.x > 5 || !Number.isInteger(item.y) || item.y > 6 || item.value < 0)) issue("Calendar cells need week 0–5, weekday 0–6, and a nonnegative count.");
    if (new Set(cells).size !== cells.length) issue("Calendar cells must have unique week and weekday coordinates.");
  }
  if (component.kind === "swimlane" && (count < 2 || count > 5 || component.items.some((item) => item.value < 0 || item.value2 <= 0))) issue("Swimlanes need 2–5 tasks, nonnegative starts, and positive durations.");
  if (component.kind === "proportionalFlow") {
    const sources = component.items.filter((item) => item.group === "source"), destinations = component.items.filter((item) => item.group === "destination");
    const sum = (items: typeof sources) => items.reduce((total, item) => total + item.value, 0);
    if (!sources.length || sources.length > 4 || !destinations.length || destinations.length > 4 || component.items.some((item) => item.value <= 0)) issue("Flows need 1–4 sources and 1–4 destinations with positive quantities.");
    if (Math.abs(sum(sources) - sum(destinations)) > Math.max(1, sum(sources)) * 1e-8) issue("Flow source and destination totals must match.");
  }
  if (component.kind === "marketSizing" && (count !== 3 || component.items.some((item, index) => item.value < 0 || (index > 0 && item.value > component.items[index - 1].value)))) issue("Market sizing needs three nested, nonnegative values: total ≥ served ≥ obtainable.");
  if (component.kind !== "pullQuote" && count < 2) context.addIssue({ code: "custom", path: ["items"], message: "This component needs at least two items." });
  if (component.kind === "pullQuote" && count !== 1) context.addIssue({ code: "custom", path: ["items"], message: "Pull quotes need one attribution." });
  if (component.kind === "processLoop" && (count < 2 || count > 4)) context.addIssue({ code: "custom", path: ["items"], message: "Process loops need 2–4 steps." });
  if (component.kind === "decisionTree" && count !== 2) context.addIssue({ code: "custom", path: ["items"], message: "Decision trees need exactly two branches." });
  if (component.kind === "decisionTree" && !component.prompt) context.addIssue({ code: "custom", path: ["prompt"], message: "Decision trees need a question." });
  if (component.kind === "decisionTree" && component.items.some((item) => !item.tag)) context.addIssue({ code: "custom", path: ["items"], message: "Decision-tree branches need short tags such as YES and NO." });
  if (component.kind === "comparison" && (!component.leftTitle || !component.rightTitle || count > 4)) context.addIssue({ code: "custom", path: ["items"], message: "Comparisons need two column titles and 2–4 paired rows." });
  if (component.kind === "scoreBreakdown" && count !== 3) context.addIssue({ code: "custom", path: ["items"], message: "Score breakdowns need exactly three values: left, right, and total." });
  if (component.kind === "scoreBreakdown" && component.items.some((item) => !item.tag)) context.addIssue({ code: "custom", path: ["items"], message: "Each score breakdown value needs a tag." });
  if (component.kind === "annotatedExample" && (!component.answer || !component.prompt)) context.addIssue({ code: "custom", path: ["answer"], message: "Annotated examples need a prompt and example answer." });
  if (component.kind === "progress" && (count < 3 || count > 8)) context.addIssue({ code: "custom", path: ["items"], message: "Progress needs 3–8 named stages." });
  if (component.kind === "metricSpotlight" && count !== 2) context.addIssue({ code: "custom", path: ["items"], message: "Metric spotlight needs before and after values." });
  if (component.kind === "pullQuote" && !component.answer) context.addIssue({ code: "custom", path: ["answer"], message: "Pull quotes need quoted text." });
  if (component.kind === "labeledVisual" && (count < 2 || count > 5)) context.addIssue({ code: "custom", path: ["items"], message: "Labeled visuals need 2–5 annotations." });
  if (component.kind === "priorityStack" && count > 6) context.addIssue({ code: "custom", path: ["items"], message: "Priority stacks need 2–6 priorities." });
  if (component.kind === "continuum" && (count < 3 || count > 7)) context.addIssue({ code: "custom", path: ["items"], message: "Decision spectrums need 3–7 positions." });
  if (component.kind === "barChart" && count > 8) context.addIssue({ code: "custom", path: ["items"], message: "Category comparisons need 2–8 categories." });
  if (["lineChart", "scatterPlot", "histogram"].includes(component.kind) && count < 3) context.addIssue({ code: "custom", path: ["items"], message: "This chart needs at least three data points." });
  if (component.kind === "stackedBar" && count > 6) context.addIssue({ code: "custom", path: ["items"], message: "Stacked bars need 2–6 rows." });
  if (["progress", "continuum"].includes(component.kind) && component.activeIndex >= count) context.addIssue({ code: "custom", path: ["activeIndex"], message: "The active position must exist in the component." });
});

const LayerOrderSchema = z.object({
  logo: z.number().int().min(0).max(20).optional(),
  footer: z.number().int().min(0).max(20).optional(),
  content: z.number().int().min(0).max(20).optional(),
  asset: z.number().int().min(0).max(20).optional(),
  supporting: z.number().int().min(0).max(20).optional(),
  callout: z.number().int().min(0).max(20).optional(),
  badge: z.number().int().min(0).max(20).optional(),
  semantic: z.number().int().min(0).max(20).optional(),
  splitFrame: z.number().int().min(0).max(20).optional(),
});

export const SlideSpecSchema = z.object({
  index: z.number().int().min(1).max(10),
  role: z.enum(["cover", "content", "proof", "summary", "cta"]),
  layout: SlideLayoutSchema,
  template: z.enum(["standard", "brand-close"]).default("standard"),
  eyebrow: z.string().max(50).optional(),
  heading: z.string().min(1).max(150),
  subheading: z.string().max(180).optional(),
  body: z.array(z.string().max(260)).max(5).default([]),
  callout: z.string().max(150).optional(),
  calloutPlacement: CalloutPlacementSchema.default("bottom-right"),
  calloutStyle: CalloutStyleSchema.default("box"),
  calloutTail: z.enum(["bottom-left", "bottom-right", "top-left", "top-right", "left", "right"]).default("bottom-left"),
  calloutAnchor: z.enum(["free", "asset", "supporting"]).default("free"),
  calloutAutoFit: z.boolean().default(true),
  asset: z.string().optional(),
  assetPlacement: AssetPlacementSchema.default("lower-right"),
  assetScale: z.number().min(20).max(90).default(48),
  assetOpacity: z.number().min(0.05).max(1).default(1),
  supportingAsset: z.string().optional(),
  supportingPlacement: SupportingPlacementSchema.default("upper-right"),
  supportingScale: z.number().min(6).max(32).default(14),
  supportingOpacity: z.number().min(0.05).max(1).default(0.9),
  additionalAssets: z.array(AddedAssetSchema).max(8).default([]),
  contentPosition: z.enum(["left", "right", "center", "full"]).default("left"),
  contentWidth: z.number().min(38).max(92).default(72),
  // Legacy values remain parseable for saved projects. The renderer deliberately
  // ignores this field, so grouped text never receives a visible panel.
  textPanel: z.enum(["none", "solid", "glass"]).default("none"),
  bodyStyle: z.enum(["paragraphs", "bullets", "numbered", "checklist", "chips"]).default("paragraphs"),
  badge: BadgeSchema.optional(),
  splitFrame: SplitFrameSchema.optional(),
  extraTextBlocks: z.array(ExtraTextBlockSchema).max(3).default([]),
  primitives: z.array(PrimitiveSchema).max(3).default([]),
  semanticComponent: SemanticComponentSchema.optional(),
  layerOrder: LayerOrderSchema.default({}),
  visualDirection: z.string().min(1),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#EAF6FF"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7F22FE"),
  editor: SlideEditorSchema.optional(),
}).superRefine((slide, context) => {
  if (slide.template === "brand-close" && slide.semanticComponent) context.addIssue({ code: "custom", path: ["semanticComponent"], message: "The fixed brand closing card slide cannot contain a semantic component." });
  for (const [field, items] of [["extraTextBlocks", slide.extraTextBlocks], ["primitives", slide.primitives], ["additionalAssets", slide.additionalAssets]] as const) {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      context.addIssue({ code: "custom", path: [field], message: `${field} IDs must be unique within a slide.` });
    }
  }
});

export const StoryboardSchema = z.object({
  title: z.string().min(1),
  narrative: z.string().min(1),
  visualSystem: z.object({
    family: z.union([VisualSystemFamilySchema, z.literal("legacy-freeform")]),
    rationale: z.string().min(1).max(300),
  }).default({ family: "legacy-freeform", rationale: "Legacy carousel created before visual-system selection was available." }),
  slides: z.array(SlideSpecSchema).min(3).max(10),
  caption: z.string().min(1),
  hashtags: z.array(z.string()).max(12),
}).superRefine((storyboard, context) => {
  const indices = storyboard.slides.map((slide) => slide.index);
  const expected = storyboard.slides.map((_, index) => index + 1);
  if (new Set(indices).size !== indices.length || indices.some((value, index) => value !== expected[index])) {
    context.addIssue({
      code: "custom",
      path: ["slides"],
      message: `Slide indexes must be unique, ordered, and contiguous from 1 to ${storyboard.slides.length}.`,
    });
  }
});

// JSON-mode providers can emit null for fields that the schema declares optional
// (or defaulted), and occasionally follow a QA suggestion whose numeric value
// conflicts with the renderer contract. Normalize these recoverable cases before
// validation; required fields and malformed objects still use the strict schema.
export function normalizeGeneratedStoryboard(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const omitNull = (record: Record<string, unknown>, keys: readonly string[]) =>
    Object.fromEntries(Object.entries(record).filter(([key, value]) => value !== null || !keys.includes(key)));
  const optionalSlideKeys = [
    "template", "eyebrow", "subheading", "body", "callout", "calloutPlacement", "calloutStyle",
    "calloutTail", "calloutAnchor", "calloutAutoFit", "asset", "assetPlacement", "assetScale",
    "assetOpacity", "supportingAsset", "supportingPlacement", "supportingScale", "supportingOpacity",
    "additionalAssets", "contentPosition", "contentWidth", "textPanel", "bodyStyle", "badge",
    "splitFrame", "extraTextBlocks", "primitives", "semanticComponent", "layerOrder", "background",
    "accent", "editor",
  ] as const;
  const clamp = (value: unknown, minimum: number, maximum: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : value;
  const clampInt = (value: unknown, minimum: number, maximum: number) => {
    const clamped = clamp(value, minimum, maximum);
    return typeof clamped === "number" ? Math.round(clamped) : clamped;
  };
  const normalizeLayerOverride = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const layer = value as Record<string, unknown>;
    return {
      ...layer,
      ...(layer.x === undefined ? {} : { x: clamp(layer.x, 0, 96) }),
      ...(layer.y === undefined ? {} : { y: clamp(layer.y, 0, 96) }),
      ...(layer.rotation === undefined ? {} : { rotation: clamp(layer.rotation, -180, 180) }),
      ...(layer.scale === undefined ? {} : { scale: clamp(layer.scale, 0.25, 3) }),
      ...(layer.zIndex === undefined ? {} : { zIndex: clampInt(layer.zIndex, 0, 20) }),
    };
  };
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.slides)) return input;
  return {
    ...record,
    slides: record.slides.map((slide) => {
      if (!slide || typeof slide !== "object" || Array.isArray(slide)) return slide;
      const slideRecord = omitNull(slide as Record<string, unknown>, optionalSlideKeys);
      const extraTextBlocks = Array.isArray(slideRecord.extraTextBlocks)
        ? slideRecord.extraTextBlocks.map((block) => {
          if (!block || typeof block !== "object" || Array.isArray(block)) return block;
          const item = block as Record<string, unknown>;
          return {
            ...item,
            x: clamp(item.x, 0, 90),
            y: clamp(item.y, 0, 92),
            width: clamp(item.width, 10, 90),
            fontSize: clamp(item.fontSize, 18, 100),
            weight: clampInt(item.weight, 300, 900),
            rotation: clamp(item.rotation, -180, 180),
            zIndex: clampInt(item.zIndex, 0, 20),
          };
        })
        : slideRecord.extraTextBlocks;
      const primitives = Array.isArray(slideRecord.primitives)
        ? slideRecord.primitives.map((primitive) => {
          if (!primitive || typeof primitive !== "object" || Array.isArray(primitive)) return primitive;
          const item = primitive as Record<string, unknown>;
          return {
            ...item,
            x: clamp(item.x, 0, 96),
            y: clamp(item.y, 0, 96),
            width: clamp(item.width, 2, 100),
            height: clamp(item.height, 1, 100),
            strokeWidth: clamp(item.strokeWidth, 0, 12),
            opacity: clamp(item.opacity, 0.05, 1),
            radius: clamp(item.radius, 0, 100),
            rotation: clamp(item.rotation, -180, 180),
            zIndex: clampInt(item.zIndex, 0, 20),
          };
        })
        : slideRecord.primitives;
      const splitFrame = slideRecord.splitFrame && typeof slideRecord.splitFrame === "object" && !Array.isArray(slideRecord.splitFrame)
        ? (() => {
          const frame = omitNull(slideRecord.splitFrame as Record<string, unknown>, ["ratio", "firstText", "secondText", "firstTextColor", "secondTextColor"]);
          return { ...frame, ...(frame.ratio === undefined ? {} : { ratio: clamp(frame.ratio, 25, 75) }) };
        })()
        : slideRecord.splitFrame;
      const layerOrder = slideRecord.layerOrder && typeof slideRecord.layerOrder === "object" && !Array.isArray(slideRecord.layerOrder)
        ? Object.fromEntries(Object.entries(slideRecord.layerOrder as Record<string, unknown>).filter(([, value]) => value !== null).map(([key, value]) => [key, clampInt(value, 0, 20)]))
        : slideRecord.layerOrder;
      const editor = slideRecord.editor && typeof slideRecord.editor === "object" && !Array.isArray(slideRecord.editor)
        ? Object.fromEntries(Object.entries(slideRecord.editor as Record<string, unknown>).filter(([, value]) => value !== null).map(([key, value]) => [key, normalizeLayerOverride(value)]))
        : slideRecord.editor;
      return {
        ...slideRecord,
        ...(slideRecord.assetScale === undefined ? {} : { assetScale: clamp(slideRecord.assetScale, 20, 90) }),
        ...(slideRecord.assetOpacity === undefined ? {} : { assetOpacity: clamp(slideRecord.assetOpacity, 0.05, 1) }),
        ...(slideRecord.supportingScale === undefined ? {} : { supportingScale: clamp(slideRecord.supportingScale, 6, 32) }),
        ...(slideRecord.supportingOpacity === undefined ? {} : { supportingOpacity: clamp(slideRecord.supportingOpacity, 0.05, 1) }),
        ...(slideRecord.contentWidth === undefined ? {} : { contentWidth: clamp(slideRecord.contentWidth, 38, 92) }),
        ...(extraTextBlocks === undefined ? {} : { extraTextBlocks }),
        ...(primitives === undefined ? {} : { primitives }),
        ...(splitFrame === undefined ? {} : { splitFrame }),
        ...(layerOrder === undefined ? {} : { layerOrder }),
        ...(editor === undefined ? {} : { editor }),
      };
    }),
  };
}

export const QAReportSchema = z.object({
  pass: z.boolean(),
  summary: z.string(),
  issues: z.array(
    z.object({
      slideIndex: z.number().int().min(1),
      severity: z.enum(["info", "warning", "error"]),
      problem: z.string(),
      fix: z.string(),
    }),
  ),
});

export const ProjectLogSchema = z.object({
  at: z.string(),
  kind: z.enum(["info", "agent", "tool", "warning", "error", "approval"]),
  message: z.string(),
});

export const ProviderFallbackSchema = z.object({
  at: z.string(),
  stage: z.string(),
  from: z.literal("vercel"),
  to: z.literal("openrouter"),
  reason: z.string(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  brief: z.string().min(3),
  contentFormat: ContentFormatSchema.default("guide"),
  tone: ToneSchema.default("playful"),
  visualFormat: VisualFormatSchema.default("auto"),
  slideCount: SlideCountSchema.default(null),
  includeBrandClose: z.boolean().default(false),
  additionalInstructions: z.string().max(2000).default(""),
  sourceNotes: z.string().default(""),
  sourceUrls: z.array(z.string().url()).default([]),
  screenshotPaths: z.array(z.string()).default([]),
  status: ProjectStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  research: ResearchDossierSchema.optional(),
  visualReferences: VisualReferenceDossierSchema.optional(),
  internetAssets: InternetAssetDossierSchema.optional(),
  sourceRiskAccepted: z.boolean().default(false),
  concepts: z.array(ConceptSchema).default([]),
  selectedConceptId: z.string().optional(),
  storyboard: StoryboardSchema.optional(),
  copyReviewSummary: z.string().optional(),
  voiceEdits: z.array(z.object({
    at: z.string(),
    field: z.string(),
    before: z.string(),
    after: z.string(),
  })).default([]),
  renderPaths: z.array(z.string()).default([]),
  qaReports: z.array(QAReportSchema).default([]),
  qaPasses: z.number().int().min(0).default(0),
  logs: z.array(ProjectLogSchema).default([]),
  aiProvider: z.enum(["vercel", "openrouter", "demo"]).optional(),
  aiModel: z.string().optional(),
  providerFallbacks: z.array(ProviderFallbackSchema).default([]),
  error: z.string().optional(),
  errorDetails: z.string().optional(),
  failedStage: z.enum(["research", "storyboard", "production"]).optional(),
  demoMode: z.boolean().default(false),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ContentFormat = z.infer<typeof ContentFormatSchema>;
export type Tone = z.infer<typeof ToneSchema>;
export type VisualFormat = z.infer<typeof VisualFormatSchema>;
export type VisualSystemFamily = z.infer<typeof VisualSystemFamilySchema>;
export type RendererCapability = z.infer<typeof RendererCapabilitySchema>;
export type ResearchDossier = z.infer<typeof ResearchDossierSchema>;
export type VisualReferenceDossier = z.infer<typeof VisualReferenceDossierSchema>;
export type GeneratedInternetAssetDossier = z.infer<typeof GeneratedInternetAssetDossierSchema>;
export type InternetAssetDossier = z.infer<typeof InternetAssetDossierSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type SlideSpec = z.infer<typeof SlideSpecSchema>;
export type QAReport = z.infer<typeof QAReportSchema>;
