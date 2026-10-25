import { describe, expect, it } from "vitest";
import { BrandDesignSchema } from "../lib/brand-design";
import { assertRequiredFonts, requiredFontAssetIds } from "./font-assets";

const fonts = [{id:"inter",name:"Inter.woff2",category:"font"},{id:"public",name:"PublicSans-Regular.woff2",category:"font"}];
const brand = {fontAssetIds:fonts.map(font=>font.id),designSystem:BrandDesignSchema.parse({headingFontName:fonts[0].name,bodyFontName:fonts[1].name})};
describe("required comparison font dependencies", () => {
  it("includes both saved fonts while optional images stay unselected", () => {
    expect(requiredFontAssetIds(brand,[...fonts,{id:"photo",name:"Space.jpg",category:"artwork"}])).toEqual(["inter","public"]);
    expect(() => assertRequiredFonts(brand,fonts)).not.toThrow();
  });
  it("finds fonts from exact rule names even after upload ids were omitted", () => {
    expect(requiredFontAssetIds({...brand,fontAssetIds:[]},fonts)).toEqual(["inter","public"]);
  });
  it("rejects the failed NASA snapshot before any generation", () => {
    expect(() => assertRequiredFonts({...brand,fontAssetIds:[]},[])).toThrow("Required brand font Inter.woff2 is missing");
    expect(() => assertRequiredFonts(brand,fonts.slice(0,1))).toThrow("PublicSans-Regular.woff2");
  });
  it("also validates font ids and per-attempt rule overrides", () => {
    expect(() => assertRequiredFonts({fontAssetIds:[],designSystem:BrandDesignSchema.parse({headingFontId:"missing"})},fonts)).toThrow("asset missing");
    expect(() => assertRequiredFonts({fontAssetIds:[]},fonts,BrandDesignSchema.parse({bodyFontName:"Missing.woff2"}))).toThrow("Missing.woff2");
  });
});
