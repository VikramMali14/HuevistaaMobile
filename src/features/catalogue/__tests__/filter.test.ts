import type { PaintShade } from "@/lib/shade-types";

import { familiesPresent, filterShades, gridItems, matchesText, NO_FILTER, toneOf } from "../filter";

const shade = (code: string, hex: string, family: string, lrv: number, brand = "Asian Paints"): PaintShade => ({
  code,
  hvCode: code,
  name: code,
  hex,
  family,
  lrv,
  brand,
  brandSlug: brand.toLowerCase().replace(/ /g, "-"),
  finishes: [],
});

const SHADES = [
  shade("HV0001", "#f6f1e4", "Off Whites", 85),
  shade("HV0002", "#f5d33f", "Yellows", 62),
  shade("HV0003", "#3e4a52", "Greys", 12),
  shade("HV0004", "#7b8a72", "Greens", 30, "Berger"),
];

describe("toneOf", () => {
  it("reads light, medium and dark from light reflectance", () => {
    expect(toneOf(70)).toBe("Light");
    expect(toneOf(55)).toBe("Light");
    expect(toneOf(40)).toBe("Medium");
    expect(toneOf(24)).toBe("Dark");
  });
});

describe("filterShades", () => {
  it("keeps everything with no filter", () => {
    expect(filterShades(SHADES, NO_FILTER)).toHaveLength(4);
  });

  it("finds a shade by its HV code", () => {
    expect(filterShades(SHADES, { ...NO_FILTER, query: "hv0003" }).map((s) => s.code)).toEqual(["HV0003"]);
  });

  it("finds a colour by a colour word", () => {
    expect(filterShades(SHADES, { ...NO_FILTER, query: "yellow" }).map((s) => s.code)).toContain("HV0002");
  });

  it("filters by company, family and depth together", () => {
    expect(filterShades(SHADES, { ...NO_FILTER, brand: "Berger" }).map((s) => s.code)).toEqual(["HV0004"]);
    expect(filterShades(SHADES, { ...NO_FILTER, family: "Whites" }).map((s) => s.code)).toEqual(["HV0001"]);
    expect(filterShades(SHADES, { ...NO_FILTER, tone: "Dark" }).map((s) => s.code)).toEqual(["HV0003"]);
  });

  it("does not search a hidden manufacturer's code", () => {
    const real = { ...SHADES[0]!, code: "L124", hvCode: "HV0001" };
    expect(matchesText(real, "l124")).toBe(false);
    expect(matchesText(real, "l124", { hideCodes: false })).toBe(true);
    expect(matchesText(real, "hv0001")).toBe(true);
  });
});

describe("familiesPresent", () => {
  it("lists only the parent families the catalogue has, in order", () => {
    expect(familiesPresent(SHADES)).toEqual(["Whites", "Greys & blacks", "Yellows & golds", "Greens"]);
  });
});

describe("gridItems", () => {
  it("heads each company when more than one is shown, and rows by three", () => {
    const items = gridItems(SHADES, 3);
    expect(items.map((i) => i.kind)).toEqual(["header", "row", "header", "row"]);
    expect(items[1]!.kind === "row" && items[1]!.shades).toHaveLength(3);
  });

  it("has no headings for one company", () => {
    expect(gridItems(SHADES.slice(0, 3), 3).map((i) => i.kind)).toEqual(["row"]);
  });
});
