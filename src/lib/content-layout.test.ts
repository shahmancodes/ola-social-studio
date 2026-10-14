import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { BrandSchema } from "./platform";
import { brandPalette, type ContentBrand } from "./content-brand";
import { buildVisualScene, scenePng } from "./content-layout";
import { storyTextIsSafe } from "./story-safe-area";

const rawBrand = BrandSchema.parse({ colors: ["#7F22FE", "#E8F5FF", "#000000"] });
const palette = brandPalette(rawBrand);
const brand: ContentBrand = { companyId: "test", name: "Example Co", audience: "Readers", voice: "Clear", description: "", typography: "", imagery: "", formatRules: "", examples: [], palette, assets: [] };

describe("format-aware visual export", () => {
  it("assigns readable palette roles regardless of input color order", () => {
    expect(palette.background).toBe("#E8F5FF");
    expect(palette.ink).toBe("#000000");
    expect(palette.accent).toBe("#7F22FE");
  });

  it("renders the same visual scene at the required post dimensions", async () => {
    const scene = await buildVisualScene("post", { title: "A specific idea", body: "One practical next action.", layout: "split" }, brand);
    const image = await sharp(await scenePng(scene)).metadata();
    expect([image.width, image.height]).toEqual([1080, 1350]);
    expect(scene.elements.some((element) => element.kind === "text" && element.text === "A specific idea")).toBe(true);
  });

  it("rejects copy that would be clipped instead of silently truncating it", async () => {
    await expect(buildVisualScene("presentation", { title: "A specific idea", body: "A very long sentence. ".repeat(90), layout: "steps" }, brand)).rejects.toThrow(/does not fit|Too many points/);
  });

  it("gives different slide purposes distinct compositions", async () => {
    const page = { title: "Do one thing", body: "Step one. Step two. Step three." };
    const cover = await buildVisualScene("presentation", { ...page, layout: "hero" }, brand);
    const steps = await buildVisualScene("presentation", { ...page, layout: "steps" }, brand);
    expect(cover.elements.filter((element) => element.kind === "rect").length).not.toBe(steps.elements.filter((element) => element.kind === "rect").length);
  });

  it("applies user controlled layout values while retaining brand furniture", async () => {
    const scene = await buildVisualScene("post", { title: "Move this title", body: "Keep this body", layout: "split", visualOverrides: { background: "#ABCDEF", title: { x: 0.12, y: 0.31, width: 0.5, fontSize: 60, color: "#123456" } } }, brand);
    const title = scene.elements.find((element) => element.kind === "text" && element.text === "Move this title");
    expect(scene.background).toBe("#ABCDEF");
    expect(title).toMatchObject({ x: 129.6, y: 418.5, size: 60, color: "#123456" });
    expect(scene.elements.some((element) => element.kind === "text" && element.text === brand.name)).toBe(true);
  });

  it("keeps a Story action clear of its checklist card", async () => {
    const scene = await buildVisualScene("story", { title: "Before you begin", body: "Read the question. Budget time. Check an error.", cta: "Save this reminder", layout: "steps" }, brand);
    const card = scene.elements.find((element) => element.kind === "rect" && element.fill === brand.palette.alternate);
    const action = scene.elements.find((element) => element.kind === "text" && element.text === "Save this reminder");
    expect(card && action && card.kind === "rect" && action.kind === "text" && card.y + card.h <= action.y).toBe(true);
  });

  it("renders and repositions a story CTA with its button", async () => {
    const scene = await buildVisualScene("story", { title: "Take one step", body: "Try it today", cta: "Start now", visualOverrides: { cta: { x: 0.14, y: 0.76, fontSize: 42 } } }, brand);
    const cta = scene.elements.find((element) => element.kind === "text" && element.text === "Start now");
    const button = scene.elements.find((element) => element.kind === "rect" && element.radius === 20 && element.fill === brand.palette.accent);
    expect(cta?.x).toBeCloseTo(151.2);
    expect(cta?.y).toBeCloseTo(1459.2);
    expect(cta?.kind === "text" && cta.size).toBe(42);
    expect(button?.x).toBeCloseTo(127.2);
  });

  it.each(["quick-tip", "announcement", "image-showcase", "conversation-prompt"] as const)("keeps %s Story text inside the Instagram guide", async (storyTreatment) => {
    const scene = await buildVisualScene("story", { title: "One useful action for students", body: "Try the next question and check what changed.", cta: "Save this", storyTreatment }, brand);
    expect(scene.width).toBe(1080);
    expect(scene.height).toBe(1920);
    expect(scene.elements.filter((item) => item.kind === "text").every((item) => storyTextIsSafe(item))).toBe(true);
  });
});
