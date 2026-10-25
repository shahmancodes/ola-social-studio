import type { SceneElement, VisualScene } from "./content-layout";
import type { LayoutGroup } from "./responsive-layout";

const isText = (element: SceneElement | undefined): element is Extract<SceneElement, { kind: "text" }> => element?.kind === "text";

/** Lay out measured peer explanations. The connector has no arrow or parent node. */
export function layoutRelatedPair(scene: VisualScene, group: LayoutGroup, add: (element: SceneElement) => void) {
  const visual = group.visual;
  if (visual?.mode !== "related-pair") return false;
  const find = (id: string | undefined) => scene.elements.find(e => e.groupId === group.id && e.id === id);
  const labels = visual.labelIds.map(find).filter(isText);
  if (labels.length !== 2) throw new Error("A related pair needs exactly two editable labels.");
  const details = labels.map(label => find(visual.details?.[label.id!]));
  const headings = (visual.headerIds ?? []).map(find).filter(isText);
  const unit = visual.unit, gap = 24 * unit, vertical = visual.columns === 1;
  let y = 0;
  for (const heading of headings) { heading.x = 0; heading.y = y; y += heading.h + gap; }
  const radius = 5 * unit, rail = 8 * unit;
  const nodes: { x: number; y: number }[] = [];
  if (vertical) {
    labels.forEach((label, index) => {
      label.x = 40 * unit; label.y = y;
      nodes.push({ x: rail, y: y + Math.min(label.h / 2, 20 * unit) });
      y += label.h;
      const detail = details[index];
      if (isText(detail)) { detail.x = label.x; detail.y = y + gap * .5; y = detail.y + detail.h; }
      y += visual.itemGap??gap * 1.5;
    });
    y -= visual.itemGap??gap * 1.5;
  } else {
    const cell = visual.itemGap===undefined?group.w * .44:(group.w-visual.itemGap)/2;
    const nodeY = y + radius;
    const labelY = nodeY + gap;
    const detailY = labelY + Math.max(...labels.map(label => label.h)) + gap * .5;
    labels.forEach((label, index) => {
      label.x = index * (group.w - cell); label.y = labelY;
      nodes.push({ x: label.x + cell / 2, y: nodeY });
      const detail = details[index];
      if (isText(detail)) { detail.x = label.x; detail.y = detailY; }
    });
    y = Math.max(...labels.map(label => label.y + label.h), ...details.filter(isText).map(detail => detail.y + detail.h));
  }
  add({ kind: "line", id: "related-pair-link", x: nodes[0].x, y: nodes[0].y, x2: nodes[1].x, y2: nodes[1].y, width: 2 * unit, color: visual.accent });
  nodes.forEach((node, i) => add({ kind: "rect", id: `related-pair-anchor-${i}`, x: node.x - radius, y: node.y - radius, w: radius * 2, h: radius * 2, radius, fill: visual.accent }));
  for (const id of visual.auxIds ?? []) {
    const note = find(id);
    if (isText(note)) { note.x = 0; note.y = y + gap; y = note.y + note.h; }
  }
  group.h = y;
  return true;
}
