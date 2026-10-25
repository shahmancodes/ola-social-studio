import type { SemanticKind } from "./semantic-component-presets";

/** Checked-in implementation decisions. Shortlisting a draft alone never enables a renderer. */
export const SEMANTIC_COMPONENT_INTEGRATIONS: ReadonlyArray<{
  candidateId: string;
  candidateName: string;
  decision: "implemented" | "not-added";
  kind?: SemanticKind;
  note: string;
}> = [
  {
    candidateId: "97396de5-0347-44ca-aac2-b2fdf24a3258",
    candidateName: "Parallel evidence anchors",
    decision: "implemented",
    kind: "relatedPair",
    note: "Implemented as Related pair: two complementary peers with editable labels and explanations. Measured text controls spacing, and an undirected connector expresses association without implying order, opposition or causality.",
  },
  {
    candidateId: "da566728-a2ad-4396-b540-0658068cccad",
    candidateName: "Evidence-context pairing",
    decision: "not-added",
    note: "Not added as a separate component. Its central prompt and two spokes duplicate the existing hub-and-spoke relationship; the related-pair component covers the peer association in this example. The old visual review also misclassified the saved page body and company logo as added component content, so those flags are not the basis for this decision. Original candidate files remain available.",
  },
];

export const componentIntegration = (id: string) => SEMANTIC_COMPONENT_INTEGRATIONS.find(entry => entry.candidateId === id);
