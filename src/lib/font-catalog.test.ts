import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FontPicker } from "../components/font-picker";
import { OTHER_FONTS, bundledFontFile, fontFamily, fontSelection, fontValue } from "./font-catalog";
import { readBundledFont, selectedFontCss } from "./editor-font-files";
import { DesignSpecSchema } from "./freeform-design";
import { EditorAppearanceSchema } from "./editor-appearance";

const spec = { type: "design", title: "Font test", background: "#FFFFFF", size: { label: "Test", widthPx: 650, heightPx: 500 }, elements: [{ kind: "text", text: "Brand typography", x: .1, y: .1, width: .8, fontSize: .06, color: "#111111" }] };
describe("shared design fonts", () => {
  it("groups company uploads before other fonts in both editors' picker", () => {
    const markup = renderToStaticMarkup(createElement(FontPicker, { fonts: [{ id: "company-font", name: "Geist-Bold.woff2" }], value: { fontId: "company-font" }, onChange: () => {} }));
    expect(markup.indexOf('label="Company fonts"')).toBeLessThan(markup.indexOf('label="Other fonts"'));
    expect(markup).toContain('value="asset:company-font" selected=""');
    expect(markup).toContain("Geist Bold");
    for (const font of OTHER_FONTS) expect(markup).toContain(font.label);
  });
  it("retains company and other font selections in free-form and main design schemas", () => {
    for (const font of OTHER_FONTS) {
      const choice = fontSelection(font.id);
      expect(fontValue(choice)).toBe(font.id);
      expect(fontFamily(choice)).toBe(font.family);
      expect(DesignSpecSchema.parse({ ...spec, elements: [{ ...spec.elements[0], ...choice }] }).elements[0]).toMatchObject(choice);
      expect(EditorAppearanceSchema.parse({ text: { title: choice } }).text?.title.font).toBe(font.id);
    }
    expect(fontSelection("asset:company-font")).toEqual({ fontId: "company-font", font: undefined });
    expect(DesignSpecSchema.parse({ ...spec, elements: [{ ...spec.elements[0], fontId: "company-font" }] }).elements[0]).toHaveProperty("fontId", "company-font");
    expect(() => DesignSpecSchema.parse({ ...spec, elements: [{ ...spec.elements[0], font: "invented-font" }] })).toThrow();
  });
  it("provides real local font files for all bundled weights and styles", async () => {
    for (const font of OTHER_FONTS.filter(f => bundledFontFile(f.id))) {
      for (const weight of [400, 700]) for (const italic of [false, true]) {
        const bytes = await readBundledFont(font.id, weight, italic);
        expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
      }
    }
    await expect(readBundledFont("../outside")).rejects.toThrow(/Unknown/);
    await expect(selectedFontCss([{ fontId: "other-company-font" }], [])).rejects.toThrow(/company/);
  });
});
