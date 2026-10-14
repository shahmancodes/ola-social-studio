import { SemanticComponentSchema, type SlideSpec } from "./schemas";

export type SemanticKind = NonNullable<SlideSpec["semanticComponent"]>["kind"];

export const SEMANTIC_COMPONENT_CHOICES: ReadonlyArray<{ kind: SemanticKind; name: string; description: string; preview: string }> = [
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
];

const item = (label: string, detail = "", tag = "", speaker: "student" | "mascot" = "student") => ({ label, detail, tag, speaker });

export function createSemanticComponent(kind: SemanticKind) {
  const examples: Record<SemanticKind, object> = {
    processLoop: { items: [item("Plan"), item("Practise"), item("Check"), item("Improve")] },
    decisionTree: { prompt: "What should I do next?", items: [item("Keep going", "This approach is working", "YES"), item("Try another way", "Change one thing and retry", "NO")] },
    checklist: { items: [item("First task", "Add a short explanation"), item("Next task", "Add a short explanation"), item("Final task", "Add a short explanation")] },
    comparison: { leftTitle: "Option A", rightTitle: "Option B", items: [item("First difference", "Better alternative"), item("Second difference", "Better alternative")] },
    timeline: { items: [item("Start", "First milestone", "1"), item("Next", "Second milestone", "2"), item("Finish", "Final milestone", "3")] },
    chatExchange: { leftTitle: "Customer", rightTitle: "Team", items: [item("I have a question"), item("Let’s work through it", "", "mascot"), item("That makes sense now")] },
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
  };
  return SemanticComponentSchema.parse({ kind, ...examples[kind] });
}
