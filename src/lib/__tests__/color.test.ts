import {
  hexToRgb,
  rgbToHex,
  hexToLab,
  deltaE,
  nearestShade,
  hsvToHex,
  hexToHsv,
  readableInk,
  contrastRatio,
} from "../color";

describe("color conversions", () => {
  it("round-trips hex → rgb → hex", () => {
    expect(rgbToHex(hexToRgb("#a47148"))).toBe("#a47148");
  });

  it("parses 3-digit hex", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("deltaE of a colour with itself is ~0", () => {
    const lab = hexToLab("#5b6c5b");
    expect(deltaE(lab, lab)).toBeCloseTo(0, 5);
  });

  it("nearestShade picks the perceptually closest", () => {
    const pool = [{ hex: "#ffffff" }, { hex: "#000000" }, { hex: "#a07050" }];
    expect(nearestShade("#a47148", pool)?.hex).toBe("#a07050");
  });

  it("hsv round-trips for a saturated colour", () => {
    const hex = "#3a4870";
    expect(hsvToHex(hexToHsv(hex)).toLowerCase()).toBe(hex);
  });

  // ── readableInk clears AA on EVERY swatch, not just the easy ones ────────
  //
  // The function used to take the better of two fixed inks — a softened
  // near-black and white — without checking that the winner actually reached
  // 4.5:1. On a mid-tone swatch both candidates fall short and the better one
  // is still short: two live catalogue shades measured 4.43:1 and 4.45:1 that
  // way, chosen correctly and still failing. A sweep over the whole colour
  // cube is the only way to catch that class, because the failures sit in a
  // narrow band of luminance no hand-picked example is likely to land in.
  it("gives every colour in the cube ink that clears AA", () => {
    const bad: Array<{ hex: string; strong: number; soft: number }> = [];
    for (let r = 0; r < 256; r += 15)
      for (let g = 0; g < 256; g += 15)
        for (let b = 0; b < 256; b += 15) {
          const hex = rgbToHex({ r, g, b });
          const { strong, soft } = readableInk(hex);
          const cs = contrastRatio(hex, strong);
          const cf = contrastRatio(hex, soft);
          if (cs < 4.5 || cf < 4.5) bad.push({ hex, strong: cs, soft: cf });
        }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("leaves ink alone on a swatch that already passes comfortably", () => {
    // The softened inks exist because pure black and white read harsh on a
    // saturated swatch. The AA rescue must not spend that on colours which
    // never needed it.
    expect(readableInk("#ffffff").strong).toBe("#171310");
    expect(readableInk("#000000").strong).toBe("#ffffff");
  });
});
