type DataPage = { role?: string; semanticComponent?: { kind: string; items: Array<{ value?: number }> } } | undefined;

/** Matching data encodings help readers compare related evidence across a series. */
export function isConsistentDataSequence(pages: readonly DataPage[]) {
  if(pages.length<2||pages.some(page=>!page?.role||!page.semanticComponent?.items.some(item=>typeof item.value==='number')))return false;
  return new Set(pages.map(page=>page!.role)).size===1&&new Set(pages.map(page=>page!.semanticComponent!.kind)).size===1;
}
