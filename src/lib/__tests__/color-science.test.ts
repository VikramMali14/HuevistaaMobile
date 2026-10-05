import {
  closenessRating,
  DARK_ROOM_LRV,
  fadeSaferAlternatives,
  fanDeck,
  hexToOklch,
  hueDistance,
  isWhiteShade,
  lighterSteps,
  lightShift,
  lrvCorrectedRgb01,
  lrvFromHex,
  pairCeilingAndTrim,
  stepInFanDeck,
  sunFadeRisk,
  temperature,
  undertone,
  undertoneClash,
  whiteTint,
} from "../color-science";
import { hexToRgb, rgbToHex } from "../color";
import { SHADES } from "../__fixtures__/sample-shades";
import type { PaintShade } from "../shade-types";

const byCode = (code: string): PaintShade => {
  const s = SHADES.find((x) => x.code === code);
  if (!s) throw new Error(`missing test shade ${code}`);
  return s;
};

describe("hueDistance", () => {
  it("wraps around the circle", () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(90, 90)).toBe(0);
  });
});

describe("lrvCorrectedRgb01", () => {
  // Linear luminance of 0..1 sRGB components — the quantity LRV measures.
  const lumaOf = ([r, g, b]: [number, number, number]) => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };

  it("returns the plain hex when no LRV is given or it is out of range", () => {
    expect(lrvCorrectedRgb01("#8080ff")).toEqual([128 / 255, 128 / 255, 1]);
    expect(lrvCorrectedRgb01("#8080ff", 0)).toEqual([128 / 255, 128 / 255, 1]);
    expect(lrvCorrectedRgb01("#8080ff", 120)).toEqual([128 / 255, 128 / 255, 1]);
    expect(lrvCorrectedRgb01("#8080ff", Number.NaN)).toEqual([128 / 255, 128 / 255, 1]);
  });

  it("leaves a hex alone when its luminance already matches the LRV", () => {
    const hex = "#c98a96";
    expect(lrvCorrectedRgb01(hex, lrvFromHex(hex))).toEqual([201 / 255, 138 / 255, 150 / 255]);
  });

  it("lands the corrected colour's luminance on the measured LRV", () => {
    // Hex implies ~LRV 20; the brand measured 35 — the paint is lighter.
    const out = lrvCorrectedRgb01("#a47148", 35);
    expect(lumaOf(out)).toBeCloseTo(0.35, 2);
    // And the darker direction too.
    const dark = lrvCorrectedRgb01("#a47148", 12);
    expect(lumaOf(dark)).toBeCloseTo(0.12, 2);
  });

  it("preserves the channel proportions (hue) while moving brightness", () => {
    const [r, g, b] = lrvCorrectedRgb01("#a47148", 35);
    // Still a warm terracotta ordering: red > green > blue.
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("guards near-black hexes and clamps runaway corrections", () => {
    // Near-black: nothing sane to scale — plain conversion.
    expect(lrvCorrectedRgb01("#010101", 50)).toEqual([1 / 255, 1 / 255, 1 / 255]);
    // Mid-grey (~LRV 22) with an absurd catalogue LRV of 90: the 2x clamp
    // keeps the result well below the unclamped target.
    const clamped = lrvCorrectedRgb01("#808080", 90);
    expect(lumaOf(clamped)).toBeLessThan(0.5);
    clamped.forEach((c) => expect(c).toBeLessThanOrEqual(1));
  });
});

describe("undertone", () => {
  it("classifies obvious directions", () => {
    expect(undertone("#c98a96")).toBe("pinkish"); // rosy
    expect(undertone("#a47148")).toBe("peachy"); // terracotta
    expect(undertone("#c9b36a")).toBe("yellowish");
    expect(undertone("#7b8a72")).toBe("greenish"); // sage
    expect(undertone("#3a4870")).toBe("bluish"); // indigo
  });
  it("calls near-greys neutral", () => {
    expect(undertone("#808080")).toBe("neutral");
    expect(undertone("#8c98a8")).not.toBe("neutral"); // pewter leans blue
  });
});

describe("temperature", () => {
  it("splits warm and cool", () => {
    expect(temperature("#a47148")).toBe("warm");
    expect(temperature("#3a4870")).toBe("cool");
    expect(temperature("#808080")).toBe("neutral");
  });
});

describe("undertoneClash", () => {
  it("flags a saturated warm against a saturated cool", () => {
    const v = undertoneClash("#b96b48", "#3a4870"); // terracotta vs indigo
    expect(v.clash).toBe(true);
    expect(v.reason).toBeTruthy();
  });
  it("does not flag two warm shades", () => {
    expect(undertoneClash("#b96b48", "#c9a17a").clash).toBe(false);
  });
  it("does not flag anything against a true grey", () => {
    expect(undertoneClash("#808080", "#3a4870").clash).toBe(false);
  });
  it("flags two whites whose tints pull different ways", () => {
    // Warm ivory vs blue-leaning white.
    const v = undertoneClash("#f3eee4", "#eef1f6");
    expect(v.clash).toBe(true);
  });
  it("does not flag two warm whites", () => {
    expect(undertoneClash("#f3eee4", "#ebe5d7").clash).toBe(false);
  });
});

describe("whiteTint / isWhiteShade", () => {
  it("reads the hidden tint of whites", () => {
    expect(whiteTint("#f3eee4")).toBe("warm"); // Bone China leans yellow
    expect(whiteTint("#eef1f6")).toBe("cool");
    expect(whiteTint("#f5f5f5")).toBe("neutral");
  });
  it("treats the Whites family and bright low-chroma shades as whites", () => {
    expect(isWhiteShade(byCode("HV-N101"))).toBe(true); // Bone China
    expect(isWhiteShade(byCode("HV-3318"))).toBe(false); // Oxblood
  });
});

describe("lighterSteps", () => {
  it("offers meaningfully lighter shades of a similar colour", () => {
    const dark = byCode("HV-7720"); // Olive Branch, LRV 18
    const steps = lighterSteps(dark, SHADES, 2);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(s.lrv).toBeGreaterThanOrEqual(dark.lrv + 8);
      expect(s.code).not.toBe(dark.code);
    }
    // Lightest step first means closest LRV above the seed first.
    if (steps.length === 2) expect(steps[0]!.lrv).toBeLessThanOrEqual(steps[1]!.lrv);
  });
  it("respects the dark-room threshold constant", () => {
    expect(DARK_ROOM_LRV).toBeGreaterThan(0);
    expect(DARK_ROOM_LRV).toBeLessThan(50);
  });
});

describe("fanDeck / stepInFanDeck", () => {
  // A catalogue built the way a paper shade card is: each base colour taken
  // lighter (mixed with white) and darker (mixed with black), in linear light so
  // the hue holds. Every card knows which strip it was printed on.
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const mix = (hex: string, toward: 0 | 1, t: number) => {
    const { r, g, b } = hexToRgb(hex);
    const ch = (v: number) => Math.round(toSrgb(toLin(v / 255) * (1 - t) + toward * t) * 255);
    return rgbToHex({ r: ch(r), g: ch(g), b: ch(b) });
  };
  const STEPS: ReadonlyArray<readonly [0 | 1, number]> = [
    [1, 0.85], [1, 0.7], [1, 0.5], [1, 0.3], [1, 0], [0, 0.35], [0, 0.6],
  ];
  const strip = (family: string, base: string, brand = "Test"): PaintShade[] =>
    STEPS.map(([toward, t], i) => {
      const hex = mix(base, toward, t);
      return { code: `${family}-${i}`, name: `${family} ${i}`, hex, family, lrv: lrvFromHex(hex), brand, finishes: [] };
    });
  // Neighbours on the colour wheel that the old strip ran together.
  const RED = strip("red", "#9b2f2a");
  const ORANGE = strip("orange", "#c2622d");
  const BROWN = strip("brown", "#6e5440"); // a muddy brown at a terracotta's hue
  const TERRACOTTA = strip("terracotta", "#b0582f");
  const BLUE = strip("blue", "#2f5d9b");
  const WARM_GREY = strip("greige", "#8a847b");
  const COOL_GREY = strip("coolgrey", "#7d858c");
  const CATALOGUE = [...RED, ...ORANGE, ...BROWN, ...TERRACOTTA, ...BLUE, ...WARM_GREY, ...COOL_GREY];
  const familyOf = (s: PaintShade) => s.code.split("-")[0];
  const lightness = (s: PaintShade) => hexToOklch(s.hex).L;

  it.each([
    ["red", RED[4]!],
    ["red", RED[2]!], // a pale tint still finds the red below it
    ["red", RED[6]!], // and a deep one the tints above
    ["orange", ORANGE[4]!],
    ["terracotta", TERRACOTTA[4]!],
    ["terracotta", TERRACOTTA[1]!],
    ["blue", BLUE[2]!],
    ["coolgrey", COOL_GREY[4]!],
  ])("keeps the %s strip to its own colour, lightest first", (family, seed) => {
    const out = fanDeck(seed, CATALOGUE, 9);
    expect(out.map(familyOf)).toEqual(out.map(() => family));
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(out).toContain(seed);
    for (let i = 1; i < out.length; i++) {
      expect(lightness(out[i - 1]!)).toBeGreaterThan(lightness(out[i]!));
    }
  });

  // A muddy brown's tints and a greige's are both near-greys a few hundredths
  // apart, and may trade places; what must not happen is either running into
  // the clear terracotta or orange of the same hue, or into the cool greys.
  it.each([
    ["brown", BROWN[4]!],
    ["greige", WARM_GREY[4]!],
  ])("keeps the muted %s strip off the clear colours", (_, seed) => {
    const out = fanDeck(seed, CATALOGUE, 9);
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(out.every((s) => ["brown", "greige"].includes(familyOf(s)!))).toBe(true);
  });

  it("orders by the colour on screen, not a disagreeing LRV", () => {
    // The brand's LRVs say the darker swatch is the lighter paint.
    const wrongLrv = RED.map((s, i) => ({ ...s, lrv: i * 10 }));
    const out = fanDeck(wrongLrv[4]!, wrongLrv, 9);
    for (let i = 1; i < out.length; i++) {
      expect(lightness(out[i - 1]!)).toBeGreaterThan(lightness(out[i]!));
    }
  });

  it("never prints the same colour twice", () => {
    const twin = { ...RED[2]!, code: "red-twin", name: "Red twin" };
    const out = fanDeck(RED[4]!, [...RED, twin], 9);
    expect(new Set(out.map((s) => s.hex)).size).toBe(out.length);
  });

  it("stays on the seed's company's card when it can", () => {
    const other = strip("red", "#9b2f2a", "Other Co").map((s) => ({ ...s, code: `x${s.code}` }));
    const out = fanDeck(RED[4]!, [...RED, ...other], 9);
    expect(out.every((s) => s.brand === "Test")).toBe(true);
  });

  it("falls back to other companies rather than a strip of one", () => {
    const lone = { ...RED[4]!, code: "lone", brand: "Lone Co" };
    const out = fanDeck(lone, [lone, ...RED.filter((_, i) => i !== 4)], 9);
    expect(out.length).toBeGreaterThan(1);
  });

  it("holds at most `max` cards with the seed near the middle", () => {
    const seed = RED[3]!;
    const out = fanDeck(seed, CATALOGUE, 5);
    expect(out.length).toBeLessThanOrEqual(5);
    const i = out.indexOf(seed);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(out.length - 1);
  });

  it("returns a lightest-first strip containing the seed on the sample palette", () => {
    const seed = byCode("HV-7706"); // Sage Whisper
    const out = fanDeck(seed, SHADES, 9);
    expect(out.some((s) => s.code === seed.code)).toBe(true);
    expect(out.map((s) => s.family)).toEqual(out.map(() => "Greens"));
    for (let i = 1; i < out.length; i++) {
      expect(lightness(out[i - 1]!)).toBeGreaterThan(lightness(out[i]!));
    }
  });

  it("no longer runs Oxblood into the oranges and browns", () => {
    const out = fanDeck(byCode("HV-3318"), SHADES, 9).map((s) => s.name);
    for (const stranger of ["Saffron Cream", "Terracotta", "Cinnamon", "Terracotta Rose", "Tan Bark", "Walnut"]) {
      expect(out).not.toContain(stranger);
    }
  });

  it("does not jump from a white straight to a near-black", () => {
    const out = fanDeck(byCode("HV-N101"), SHADES, 9); // Bone China
    expect(out.map((s) => s.name)).not.toContain("Ink");
  });

  it("steps lighter and darker from the seed", () => {
    const seed = RED[3]!;
    const lighter = stepInFanDeck(seed, CATALOGUE, -1);
    const darker = stepInFanDeck(seed, CATALOGUE, 1);
    expect(lighter && lightness(lighter)).toBeGreaterThan(lightness(seed));
    expect(darker && lightness(darker)).toBeLessThan(lightness(seed));
    expect(familyOf(lighter!)).toBe("red");
    expect(familyOf(darker!)).toBe("red");
  });
});

describe("lightShift", () => {
  it("moves a saturated teal more than a grey", () => {
    const teal = lightShift("#2a8f86");
    const grey = lightShift("#8a8a8a");
    expect(teal.score).toBeGreaterThan(grey.score);
    expect(grey.score).toBeLessThan(2);
    expect(teal.warmHex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("sunFadeRisk / fadeSaferAlternatives", () => {
  it("flags deep saturated reds and blues, not pale calm shades", () => {
    expect(sunFadeRisk(byCode("HV-3318"))).toBe(true); // Oxblood
    expect(sunFadeRisk(byCode("HV-7711"))).toBe(false); // Pale Sage
    expect(sunFadeRisk(byCode("HV-N101"))).toBe(false); // Bone China
  });
  it("suggests lighter or calmer neighbours", () => {
    const risky = byCode("HV-3318");
    const alts = fadeSaferAlternatives(risky, SHADES, 2);
    for (const a of alts) {
      expect(a.code).not.toBe(risky.code);
    }
  });
});

describe("pairCeilingAndTrim", () => {
  it("pairs a warm wall with a warm-side white ceiling and a quiet trim", () => {
    const wall = byCode("HV-2118"); // Terracotta, warm
    const { ceiling, trim } = pairCeilingAndTrim(wall, SHADES);
    expect(ceiling).toBeTruthy();
    expect(isWhiteShade(ceiling!)).toBe(true);
    expect(["warm", "pinkish", "neutral"]).toContain(whiteTint(ceiling!.hex));
    expect(trim).toBeTruthy();
    expect(trim!.code).not.toBe(wall.code);
    expect(trim!.code).not.toBe(ceiling!.code);
  });
  it("gives a dark wall a lighter trim and a light wall a darker trim", () => {
    const dark = byCode("HV-3304"); // Walnut, LRV 14
    const light = byCode("HV-N105"); // Ivory Coast, LRV 82
    const darkPair = pairCeilingAndTrim(dark, SHADES);
    const lightPair = pairCeilingAndTrim(light, SHADES);
    expect(darkPair.trim!.lrv).toBeGreaterThan(dark.lrv);
    expect(lightPair.trim!.lrv).toBeLessThan(light.lrv);
  });
});

describe("closenessRating", () => {
  it("maps ΔE to honest counter words", () => {
    expect(closenessRating(0)).toBe("Very close");
    expect(closenessRating(3)).toBe("Very close");
    expect(closenessRating(4.5)).toBe("Close");
    expect(closenessRating(6)).toBe("Close");
    expect(closenessRating(9)).toBe("Not exact");
  });
});
