import { SemanticComponentSchema, type SlideSpec } from "./schemas";

export type SemanticKind = NonNullable<SlideSpec["semanticComponent"]>["kind"];

export const SEMANTIC_COMPONENT_CHOICES: ReadonlyArray<{ kind: SemanticKind; name: string; description: string; preview: string }> = [
  { kind: "relatedPair", name: "Related pair", description: "Two complementary ideas linked without order, opposition or causality", preview: "●────────●\nEvidence  Context" },
  { kind: "processSteps", name: "Linear process", description: "Two to four ordered steps with a clear beginning and end", preview: "01 → 02 → 03\nDiscover · Build · Review" },
  { kind: "metricGrid", name: "Metric grid", description: "Two to four related numbers with labels and context", preview: "84%    12%\nRETAIN  GROW" },
  { kind: "bulletChart", name: "Actual vs target", description: "Measured performance against an explicit target", preview: "Actual ━━━━━│──\n            Target" },
  { kind: "processLoop", name: "Process loop", description: "Two to four steps that repeat in a cycle", preview: "   ①\n④  ↻  ②\n   ③" },
  { kind: "decisionTree", name: "Decision tree", description: "A question branching to two outcomes", preview: "◇\n↙   ↘\nYES   NO" },
  { kind: "checklist", name: "Checklist", description: "A clear list of actions to complete", preview: "✓  First task\n✓  Next task\n✓  Final task" },
  { kind: "comparison", name: "Comparison", description: "Two approaches shown side by side", preview: "OPTION A  │  OPTION B\n✕  Old way │ ✓  New way" },
  { kind: "timeline", name: "Timeline", description: "A sequence of milestones or dates", preview: "①  Start\n│\n②  Next\n│\n③  Finish" },
  { kind: "chatExchange", name: "Chat exchange", description: "Two voices in a short dialogue", preview: "CUSTOMER  ▢\n       ▪  TEAM\nCUSTOMER  ▢" },
  { kind: "annotatedExample", name: "Annotated example", description: "An example with labelled takeaways", preview: "EXAMPLE  [1] [2]\n①  What works\n②  What to fix" },
  { kind: "scoreBreakdown", name: "Score breakdown", description: "A numeric formula with explanations", preview: "42 + 3 = 45\nSUBJECTS  CORE" },
  { kind: "progress", name: "Progress", description: "Named stages with a clear current step", preview: "Brief  Plan  Design  Build\n━━━━━━  ━━━━━━  ━━━━━━  ──────" },
  { kind: "metricSpotlight", name: "Metric spotlight", description: "One number and its before–after context", preview: "42%\n28% → 42%" },
  { kind: "pullQuote", name: "Pull quote", description: "A memorable statement with attribution", preview: "“The important line.”\n— Source" },
  { kind: "labeledVisual", name: "Labeled visual", description: "An illustration with anchored explanations", preview: "①  LID\n②  WALL\n③  BASE" },
  { kind: "priorityStack", name: "Priority stack", description: "What to do now, next, and later", preview: "01  DO NOW\n02  DO NEXT\n03  LATER" },
  { kind: "continuum", name: "Decision spectrum", description: "Three to seven choices on one scale", preview: "●──●──◉──●──●\nOPEN      STRICT" },
  { kind: "barChart", name: "Category comparison", description: "Compare named values on a shared scale", preview: "A  ━━━━━ 42%\nB  ━━━ 31%" },
  { kind: "lineChart", name: "Trend chart", description: "Show change across ordered periods", preview: "▁▂▃▄▆█\nW1      W6" },
  { kind: "stackedBar", name: "Stacked bars", description: "Compare parts of a whole across groups", preview: "A  ███▓▓░\nB  ████▓░" },
  { kind: "scatterPlot", name: "Scatter plot", description: "Show a relationship between two measures", preview: "·  ·   ·\n  ·   ·  ·" },
  { kind: "histogram", name: "Histogram", description: "Show how values are distributed", preview: "▂▄▆█▇▅▃▁" },
  { kind: "pieChart", name: "Pie / donut breakdown", description: "One whole split into 3–5 labelled segments", preview: "◔  Build 40%\n   Review 30%" },
  { kind: "hierarchyPyramid", name: "Hierarchy pyramid", description: "3–5 nested levels in one continuous triangle", preview: "   △\n  ───\n ─────" },
  { kind: "hubSpoke", name: "Hub & spoke", description: "A central idea connected to independent peers", preview: "  ●\n●─◎─●\n  ●" },
  { kind: "conversionFunnel", name: "Conversion funnel", description: "A tapered journey with descending stage counts", preview: "████████ 1000\n ██████ 650\n  ████ 400" },
  { kind: "waterfall", name: "Waterfall bridge", description: "Opening total, signed changes, and closing total", preview: "40  +15  −10  45\n█    ▀    ▀   █" },
  { kind: "quadrant", name: "Two-axis quadrant", description: "Editable dots positioned on two decision axes", preview: "  ● │  ●\n────┼────\n    │ ●" },
  { kind: "venn", name: "Set overlap", description: "Exclusive regions and the intersection of two sets", preview: "( Left (Shared) Right )" },
  { kind: "calendarHeatmap", name: "Calendar heatmap", description: "Daily activity intensity across six weeks", preview: "░▒▓░▒█\n▒▓█░▓▒\n▓░▒▒█▓" },
  { kind: "swimlane", name: "Parallel swimlanes", description: "Task duration and ownership on a shared time axis", preview: "Design ━━━\nBuild    ━━━━━\nLaunch       ━" },
  { kind: "proportionalFlow", name: "Proportional flow", description: "Conserved quantities merging and splitting", preview: "60 ╲     ╱ 35\n    100\n40 ╱     ╲ 65" },
  { kind: "marketSizing", name: "TAM / SAM / SOM", description: "Nested market scopes with editable labels and values", preview: "◯ TAM $100B\n ◯ SAM $15B\n  ● SOM $500M" },
];

const item = (label: string, detail = "", tag = "", speaker: "student" | "mascot" = "student") => ({ label, detail, tag, speaker });

export function createSemanticComponent(kind: SemanticKind) {
  const examples: Record<SemanticKind, object> = {
    relatedPair: { prompt: "Put the observation in context", items: [item("What you noticed", "Describe the specific observation"), item("What helps explain it", "Add the relevant surrounding context")] },
    processSteps: { prompt: "From idea to delivery", items: [item("Discover", "Agree on the problem"), item("Build", "Make the smallest useful version"), item("Review", "Test it with real people")] },
    metricGrid: { prompt: "The quarter at a glance", unit: "%", items: [{ ...item("Retention", "Customers who stayed"), value: 84 }, { ...item("Growth", "Change from last quarter"), value: 12 }, { ...item("Activation", "New accounts reaching value"), value: 67 }, { ...item("Referral", "Sign-ups from recommendations"), value: 23 }] },
    bulletChart: { prompt: "Progress against the plan", unit: "%", leftTitle: "Actual", rightTitle: "Target", items: [{ ...item("Activation"), value: 68, value2: 80 }, { ...item("Retention"), value: 92, value2: 90 }, { ...item("Referral"), value: 24, value2: 35 }] },
    processLoop: { items: [item("Plan"), item("Practise"), item("Check"), item("Improve")] },
    decisionTree: { prompt: "What should I do next?", items: [item("Keep going", "This approach is working", "YES"), item("Try another way", "Change one thing and retry", "NO")] },
    checklist: { items: [item("First task", "Add a short explanation"), item("Next task", "Add a short explanation"), item("Final task", "Add a short explanation")] },
    comparison: { leftTitle: "Option A", rightTitle: "Option B", items: [item("First difference", "Better alternative"), item("Second difference", "Better alternative")] },
    timeline: { items: [item("Start", "First milestone", "1"), item("Next", "Second milestone", "2"), item("Finish", "Final milestone", "3")] },
    chatExchange: { leftTitle: "Customer", rightTitle: "Team", items: [item("I have a question"), item("Let’s work through it", "", "", "mascot"), item("That makes sense now")] },
    annotatedExample: { prompt: "Example answer", answer: "**Key idea:** Explain what happens and why it matters.", items: [item("Key idea", "Name the important point"), item("Explanation", "Show the reasoning")] },
    scoreBreakdown: { takeaway: "Add the parts to see the total", items: [item("Part one", "First contribution", "2"), item("Part two", "Second contribution", "3"), item("Total", "Combined result", "5")] },
    progress: { prompt: "Launch plan", activeIndex: 3, items: [item("Brief"), item("Plan"), item("Design"), item("Build"), item("Review"), item("Launch")] },
    metricSpotlight: { prompt: "The result", answer: "found the answer on their first try", unit: "%", items: [{ ...item("Previously"), value: 28 }, { ...item("Now"), value: 42 }] },
    pullQuote: { prompt: "In their own words", answer: "I didn't need more features. I needed to know what to do next.", items: [item("Maya", "Customer interview")] },
    labeledVisual: { prompt: "Product anatomy", answer: "What each part does", items: [{ ...item("Sealed lid", "Helps stop leaks in a bag"), x: 74, y: 15 }, { ...item("Insulated wall", "Slows heat transfer"), x: 76, y: 50 }, { ...item("Stable base", "Helps the bottle stand securely"), x: 75, y: 84 }] },
    priorityStack: { prompt: "In the right order", answer: "Start where it matters", items: [item("Find the real blocker", "Ask before redesigning anything", "DO NOW"), item("Fix the confusing step", "", "DO NEXT"), item("Explore the nice-to-haves", "", "LATER")] },
    continuum: { prompt: "Decision spectrum", answer: "How structured should it be?", activeIndex: 2, items: [item("Open"), item("Light"), item("Guided"), item("Defined"), item("Strict")] },
    barChart: { prompt: "Where requests start", unit: "%", items: [{ ...item("Email"), value: 42 }, { ...item("Chat"), value: 31 }, { ...item("Phone"), value: 18 }, { ...item("Other"), value: 9 }] },
    lineChart: { prompt: "Trial completion is rising", unit: "%", items: [36, 39, 43, 48, 55, 61].map((value, index) => ({ ...item(`W${index + 1}`), value })) },
    stackedBar: { prompt: "How time is spent", unit: "%", leftTitle: "Focus", rightTitle: "Meetings", takeaway: "Admin", items: [{ ...item("Team A"), value: 50, value2: 30, value3: 20 }, { ...item("Team B"), value: 65, value2: 20, value3: 15 }] },
    scatterPlot: { prompt: "Practice and exam scores", leftTitle: "Practice hours", rightTitle: "Exam score", items: [[1, 35], [2, 42], [3, 51], [4, 48], [5, 66], [6, 63], [7, 79]].map(([value, value2], index) => ({ ...item(`Student ${index + 1}`), value, value2 })) },
    histogram: { prompt: "Completion times", unit: "responses", items: [7, 15, 25, 34, 28, 17, 8, 4].map((value, index) => ({ ...item(`${index}–${index + 1}`), value })) },
    pieChart: { prompt: "How the whole breaks down", items: [["Build", 40], ["Review", 30], ["Plan", 20], ["Research", 10]].map(([label, value]) => ({ label, value })) },
    hierarchyPyramid: { prompt: "Connect the detail to the bigger goal", items: [item("Purpose"), item("Strategy"), item("Daily actions")] },
    hubSpoke: { prompt: "Launch", items: [item("People"), item("Product"), item("Content"), item("Support")] },
    conversionFunnel: { prompt: "From attention to activation", items: [["Visits", 1000], ["Sign-ups", 650], ["Activated", 400], ["Paid", 200]].map(([label, value]) => ({ label, value })) },
    waterfall: { prompt: "What changed this week", unit: "h", items: [["Opening", 40], ["New hires", 15], ["Leave", -10], ["Closing", 45]].map(([label, value]) => ({ label, value })) },
    quadrant: { prompt: "Choose where to focus", leftTitle: "Effort", rightTitle: "Impact", items: [{ label: "A", x: 72, y: 72, radius: 14 }, { label: "B", x: 27, y: 63, radius: 10, color: "#4385A4" }, { label: "C", x: 61, y: 24, radius: 22, color: "#B96537" }] },
    venn: { prompt: "Find the shared opportunity", leftTitle: "User needs", rightTitle: "Business goals", items: [item("Useful", "Simple"), item("Viable", "Scalable"), item("Shared value")] },
    calendarHeatmap: { prompt: "The rhythm behind the activity", unit: "posts", items: Array.from({ length: 30 }, (_, index) => ({ label: `Week ${Math.floor(index / 5) + 1}, day ${index % 5 + 1}`, x: Math.floor(index / 5), y: index % 5, value: [1, 3, 2, 0, 1, 2, 4, 3, 0, 2][index % 10] })) },
    swimlane: { prompt: "Who owns each piece of work", unit: "weeks", items: [{ label: "Design", value: 0, value2: 2 }, { label: "Build", value: 1, value2: 3 }, { label: "Launch", value: 3, value2: 1 }] },
    proportionalFlow: { prompt: "Where leads go next", items: [{ label: "Web", value: 60, group: "source" }, { label: "App", value: 40, group: "source" }, { label: "Trial", value: 35, group: "destination" }, { label: "Direct", value: 65, group: "destination" }] },
    marketSizing: { prompt: "Size the opportunity", unit: "$", items: [{ label: "Total market", tag: "TAM", value: 100_000_000_000 }, { label: "Served market", tag: "SAM", value: 15_000_000_000 }, { label: "Obtainable", tag: "SOM", value: 500_000_000 }] },
  };
  return SemanticComponentSchema.parse({ kind, ...examples[kind] });
}

/** Shared by every content specialist so the model and editor see one library. */
export function semanticComponentModelGuide() {
  const examples = SEMANTIC_COMPONENT_CHOICES.map(choice => {
    const component = createSemanticComponent(choice.kind);
    const example = Object.fromEntries(Object.entries(component).filter(([key, value]) => !["style", "assetPath", "chartStyle"].includes(key) && value !== "" && value !== null && value !== 0).map(([key, value]) => [key, key === "items" ? component.items.map(item => Object.fromEntries(Object.entries(item).filter(([field, entry]) => entry !== "" && entry !== null && (entry !== 0 || ["x", "y"].includes(field)) && !(field === "speaker" && entry === "student") && !(field === "group" && entry === "source") && !(field === "radius" && entry === 14) && !(["x", "y"].includes(field) && entry === 50)))) : value]));
    return { ...choice, preview: undefined, example };
  });
  return `Optional semanticComponent on a page or article section uses the shared native library below. Character limits are strict: item label ≤72, item detail ≤140, item tag ≤20; prompt and note ≤130, answer ≤260, column titles ≤36, takeaway ≤160. Keep generated details comfortably below those limits. These examples show STRUCTURE ONLY: never copy example figures or claims into the result. Use only brief-supplied or verified values; do not invent quantitative data. Use at most one visual per page: semanticComponent OR visualContent OR assetId. For Story choose image-showcase when using a semanticComponent. Keep surrounding body short and do not repeat labels. Omit graphics for exact-copy briefs that do not permit additional content. relatedPair connects exactly two complementary peers, each with a label and optional detail; prompt is shared context, answer is optional explanation, note is optional source. It implies no sequence, hierarchy, causality or exclusive choice. Use hubSpoke only when a central entity and explicit peer associations help explain the brief; its native renderer connects each peer to the shared prompt, with no peer-to-peer steps. For three or more neutral complementary label/detail fields, prefer visualContent.kind=example (up to four pairs, label ≤72 and detail ≤150) instead of inventing a hub, to-do list or exclusive alternatives. Existing readable native checklist fields may also omit completion marks with responsive.visual.nodes:none at composition time. Comparison is for alternatives, and decisionTree for mutually exclusive outcomes. A statement with structured supporting copy does not by itself call for a relationship diagram. Keep hub prompt copy distinct from a separate headline unless the central context intentionally IS the headline; shared headline typography remains measured. Linear process uses processSteps for a one-way sequence (use processLoop only for cycles). metricGrid uses 2–4 values in the same unit with label/detail context. bulletChart uses value=actual, value2=target; actual must be nonnegative and target positive, with 2–4 rows and a common unit. Histogram frequencies and stacked-bar parts must be nonnegative. Pie supports chartStyle pie/donut, 3–5 positive weights; percentages are calculated. Pyramid supports 3–5 levels. Waterfall's last value MUST equal opening + intermediate signed changes. Calendar x is week 0–5, y is weekday 0–6; missing cells differ from zero. Swimlane value=start, value2=positive duration. Flow group=source/destination with equal totals on each side. Market values must be nested descending values in the SAME unit; circles are schematic. Quadrant x/y are 0–100, radius is 6–32, optional color is a hex color. Leave style omitted to inherit the brand. Library: ${JSON.stringify(examples)}`;
}
