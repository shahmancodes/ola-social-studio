/** Shared by live text and the SVG/PNG renderer. Keep geometry-affecting rules here. */
export const CANVAS_TYPOGRAPHY = {
  boxSizing: "border-box", margin: 0, border: 0, padding: "0.2em 0 0",
  lineHeight: 1.15, letterSpacing: "normal", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
} as const;
export const CANVAS_TYPOGRAPHY_CSS = "box-sizing:border-box;margin:0;border:0;padding:.2em 0 0;line-height:1.15;letter-spacing:normal;white-space:pre-wrap;overflow-wrap:anywhere;";
