# Shared design primitives

Ola can use rectangles, rounded rectangles, circles, lines, directional arrows, mutual arrows and elbow connectors when they explain the content. These are optional tools. A shape requires a grouping or relationship purpose; a plain statement does not need a diagram.

The shared visual-page editor exposes **Shapes**, searchable alongside components and images. Inserted primitives use the brand accent and remain ordinary editable objects. Select two non-line objects and choose **Connect objects** to attach an arrow to their edges. It follows movement, resizing and rotation of those objects. Arrowheads, path and stroke are editable. Detach a connector before positioning it independently. Deleting a target leaves a loose line at the last saved location. Duplicating connected objects remaps the attachment IDs.

This library is available wherever the shared page canvas is used: Story, Carousel, Poster, Post and Presentation. Semantic component specifications also render the same primitives in Article blocks. This does not enable formats currently marked Coming Soon.

## Agent use

The existing on-demand component designer receives these optional capabilities; there is no additional agent, mandatory model stage or provider call.

A semantic specification can declare `enclosures` using a shape kind, brand tone, purpose and existing node IDs. The renderer calculates the enclosure from the existing text regions in each responsive profile. The agent does not need to specify another set of shape coordinates. Enclosures must stay inside the component and cannot cover unrelated text regions.

Connectors name `from` and `to` node IDs. `kind` is `line`, `arrow` or `double-arrow`. `route` is optional: `auto` tries a clear direct route, then orthogonal routes around text and grouped surfaces. `straight` rejects crossings, and `elbow` requests orthogonal routing. Where nodes belong to different enclosures, the connector attaches to the corresponding enclosure edges. Shapes do not add visible copy, imply extra steps, fabricate data or change canonical text.

Text regions can grow downward into existing clear space before font fitting reduces the text size. Their top and width remain fixed. The next overlapping text region, meaningful shape boundaries and separate enclosure padding limit that growth. Only the measured required height becomes part of the resolved geometry; unused capacity is not drawn or reserved as filler. Native shapes and connector endpoints follow the resolved regions. Render evidence records the declared, available and measured heights in `semanticFit`, while the source specification stays unchanged.

Existing explicit portrait/landscape profile shapes remain supported. New candidates still require the existing six-format geometry checks and independent rendered review. A primitive is a means of communication, not evidence that an artifact meets the professional-quality goal.

## Related text flow

A custom component can set `textFlow:"grouped"` in its specification. A composed page can select the same mode through a partial repair:

```json
{"target":"page-1","responsive":{"visual":{"textFlow":"grouped"}}}
```

The renderer packs unambiguous canonical item label/detail stacks, including a trailing tag where its existing position permits it. Each field keeps its width and horizontal position; measured heights replace empty reserved space within a shared stack. Other regions align to their existing top. The renderer adds no surface or copy. Side-by-side fields, intervening text, earlier branch markers and separate surfaces/enclosures retain independent regions.

A stack uses available clear space, then fits related typography together while respecting reading minima. If it still cannot fit, the renderer requests a diagram reflow. `semanticFlow` evidence records the fields, gap, available height and occupied height. The agent can choose this control during planning or local repair; it adds no model stage. Omission preserves legacy placement; `textFlow:"regions"` restores it, including when overriding a grouped specification.

For a source-preserving local comparison, run `node --import tsx scripts/ola-semantic-fit-proof.mjs`, then run it again with `--grouped --after /absolute/path/to/the/baseline/report.json`. The second run changes only this control in the replayed specification. It does not promote or replace the saved candidate.

## Portability and verification

[The reusable example](../examples/design-primitives.json) binds one source specification to all six component formats. Brand colors and measured page geometry are resolved by the destination renderer. PNG/SVG and the editor use shared vector geometry; PowerPoint retains native editable shapes and line parts, with the existing font fallback. Manual canvas connectors follow their endpoints; automatic obstacle routing belongs to the semantic diagram renderer.

Run `node --import tsx scripts/ola-primitives-proof.mjs` for a local synthetic proof. It writes six format previews and exercises the real editor's library insertion, keyboard tabs, attached movement, arrow controls and reload. It records source fingerprints and makes no provider calls or saved-project changes.
