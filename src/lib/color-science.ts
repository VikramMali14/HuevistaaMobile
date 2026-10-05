// Ported from HueVistaFrontEnd/src/lib/color-science.ts — keep the two in step.
/**
 * Colour-science layer on top of lib/color.ts — everything the catalogue's
 * counter tools need: undertone classification, white-tint sorting, clash
 * detection, dark-room and sun-fade heuristics, fan-deck strips, lamplight
 * shift, and ceiling/trim pairing. All pure and unit-tested.
 *
 * Conventions: Lab from lib/color.ts (D65). "Hue" below is the CIELAB hue
 * angle in degrees — atan2(b, a) — where 0° ≈ pink-red, 90° ≈ yellow,
 * 180° ≈ green, 270° ≈ blue. "Chroma" is √(a² + b²); low chroma means the
 * colour is close to grey and undertone talk stops mattering.
 */

import { deltaE, hexToLab, hexToRgb, luminance, rgbToHex, rgbToLab, type Lab } from "./color";
import type { PaintShade } from "./shade-types";

// ── Lab geometry ───────────────────────────────────────────────────────────

export function chroma(lab: Lab): number {
  return Math.hypot(lab.a, lab.b);
}

/** CIELAB hue angle in [0, 360). Meaningless when chroma is near zero. */
export function labHue(lab: Lab): number {
  const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return (h + 360) % 360;
}

/** Smallest angular distance between two hues, in [0, 180]. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Approximate LRV (0–100) straight from a hex — for colours without one. */
export function lrvFromHex(hex: string): number {
  return Math.round(luminance(hexToRgb(hex)) * 100);
}

// sRGB transfer functions on 0..1 components (the 0..255 variants live in
// lib/color.ts; these stay local to keep lrvCorrectedRgb01 self-contained).
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/**
 * The colour the renderer should PAINT for a catalogue shade: the hex's hue
 * and saturation with its brightness corrected to the shade's measured LRV.
 * Returned as 0..1 sRGB components, ready for the recolor engines' `target`.
 *
 * Catalogue hexes are screen approximations; the LRV (Light Reflectance
 * Value, 0–100) is the brand's MEASURED fraction of light the real paint
 * reflects — LRV 60 means CIE Y = 0.60. When the hex's implied luminance
 * disagrees with the measured LRV, trust the measurement: scale the
 * linear-RGB channels so the painted colour's luminance lands on LRV/100.
 * Chromaticity (hue/saturation) stays put; only brightness moves.
 *
 * Guard rails, each falling back to the plain hex: no/invalid LRV, a
 * near-black hex (nothing to scale), or a disagreement under 3% (screen
 * noise, not data). The correction is clamped to [0.5, 2]× so one bad
 * catalogue row can't blow a colour out, and channels that would exceed 1
 * are clipped — an extreme lift slightly desaturates instead of wrapping.
 */
export function lrvCorrectedRgb01(hex: string, lrv?: number): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  const plain: [number, number, number] = [r / 255, g / 255, b / 255];
  if (lrv === undefined || !Number.isFinite(lrv) || lrv <= 0 || lrv > 100) return plain;

  const lr = srgbToLinear(plain[0]);
  const lg = srgbToLinear(plain[1]);
  const lb = srgbToLinear(plain[2]);
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  if (y < 0.005) return plain;

  let ratio = lrv / 100 / y;
  if (Math.abs(ratio - 1) < 0.03) return plain;
  ratio = Math.max(0.5, Math.min(2, ratio));

  return [
    linearToSrgb(Math.min(1, lr * ratio)),
    linearToSrgb(Math.min(1, lg * ratio)),
    linearToSrgb(Math.min(1, lb * ratio)),
  ];
}

// ── Undertones ─────────────────────────────────────────────────────────────

export type Undertone =
  | "pinkish"
  | "peachy"
  | "yellowish"
  | "greenish"
  | "bluish"
  | "violet"
  | "neutral";

/** Chroma below this reads as grey — no meaningful undertone. */
const NEUTRAL_CHROMA = 4;

export function undertone(hex: string): Undertone {
  const lab = hexToLab(hex);
  if (chroma(lab) < NEUTRAL_CHROMA) return "neutral";
  // CIELAB hue anchors: red ≈ 40°, orange ≈ 59°, yellow ≈ 102°, green ≈ 136°,
  // cyan ≈ 196°, blue ≈ 306°, magenta ≈ 328° — the cool arc is wide, the warm
  // arc cramped, so these bands are NOT evenly spaced on purpose.
  const h = labHue(lab);
  if (h < 40) return "pinkish";
  if (h < 75) return "peachy";
  if (h < 115) return "yellowish";
  if (h < 175) return "greenish";
  if (h < 312) return "bluish";
  if (h < 345) return "violet";
  return "pinkish";
}

export type Temperature = "warm" | "cool" | "neutral";

const WARM_TONES: ReadonlyArray<Undertone> = ["pinkish", "peachy", "yellowish"];

export function temperature(hex: string): Temperature {
  const tone = undertone(hex);
  if (tone === "neutral") return "neutral";
  return WARM_TONES.includes(tone) ? "warm" : "cool";
}

export interface ClashVerdict {
  clash: boolean;
  /** Plain-words reason, ready to show to a customer. */
  reason?: string;
}

/**
 * Do two shades "fight"? Two cases worth warning about:
 *  - a clearly warm colour next to a clearly cool one (both saturated enough
 *    that the difference shows on a wall);
 *  - two near-whites whose hidden tints pull different ways (the classic
 *    "my ceiling white looks dirty next to the wall white" complaint).
 * Anything involving a true neutral never clashes.
 */
export function undertoneClash(hexA: string, hexB: string): ClashVerdict {
  const labA = hexToLab(hexA);
  const labB = hexToLab(hexB);
  const cA = chroma(labA);
  const cB = chroma(labB);

  // Whites: small tints, but side by side they show.
  if (labA.L >= 85 && labB.L >= 85) {
    const tintA = whiteTint(hexA);
    const tintB = whiteTint(hexB);
    if (tintA !== "neutral" && tintB !== "neutral" && tintA !== tintB) {
      return { clash: true, reason: `one white leans ${tintA}, the other ${tintB} — side by side they fight` };
    }
    return { clash: false };
  }

  if (cA < 8 || cB < 8) return { clash: false };
  const tA = temperature(hexA);
  const tB = temperature(hexB);
  if (tA !== "neutral" && tB !== "neutral" && tA !== tB) {
    return {
      clash: true,
      reason: `${undertone(hexA)} (${tA}) against ${undertone(hexB)} (${tB}) can look odd in the same room`,
    };
  }
  return { clash: false };
}

// ── Whites ─────────────────────────────────────────────────────────────────

export type WhiteTint = "warm" | "pinkish" | "greenish" | "cool" | "neutral";

/** Display order for the whites finder — warm side first. */
export const WHITE_TINTS: ReadonlyArray<WhiteTint> = ["warm", "pinkish", "neutral", "greenish", "cool"];

export function isWhiteShade(s: PaintShade): boolean {
  // Family names come straight from each brand's data — "Whites", "off whites",
  // "Whites & Off Whites" all count.
  if (s.family.toLowerCase().includes("white")) return true;
  const lab = hexToLab(s.hex);
  return s.lrv >= 72 && chroma(lab) < 10;
}

/** The hidden tint of a near-white. Thresholds are deliberately small. */
export function whiteTint(hex: string): WhiteTint {
  const lab = hexToLab(hex);
  if (lab.b >= 5) return "warm"; // yellow-leaning
  if (lab.a >= 3) return "pinkish";
  if (lab.a <= -3) return "greenish";
  if (lab.b <= -2) return "cool"; // blue-leaning
  return "neutral";
}

// ── Dark-room and lighter-step helpers ─────────────────────────────────────

/** Below this LRV a whole room starts to feel dark without strong lighting. */
export const DARK_ROOM_LRV = 25;

/**
 * Up to `n` catalogue shades that read as "the same colour, one or two steps
 * lighter": meaningfully higher LRV, similar hue, broadly similar chroma.
 * Sorted lightest-step-first (closest LRV above the seed first).
 */
export function lighterSteps(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  n = 2,
): PaintShade[] {
  const seed = hexToLab(shade.hex);
  const seedHue = labHue(seed);
  const seedChroma = chroma(seed);
  const pick = (maxHueDist: number, chromaSlack: number) =>
    catalogue
      .filter((c) => {
        if (c.code === shade.code || c.lrv < shade.lrv + 8) return false;
        const lab = hexToLab(c.hex);
        const ch = chroma(lab);
        // Both near-grey → hue is meaningless, treat as same family.
        const hueOk =
          seedChroma < NEUTRAL_CHROMA || ch < NEUTRAL_CHROMA
            ? Math.abs(ch - seedChroma) <= chromaSlack
            : hueDistance(labHue(lab), seedHue) <= maxHueDist;
        return hueOk && Math.abs(ch - seedChroma) <= chromaSlack;
      })
      .sort((a, b) => a.lrv - b.lrv);
  let out = pick(35, 25);
  if (out.length === 0) out = pick(60, 45); // relax before giving up
  return out.slice(0, n);
}

// ── Fan deck ───────────────────────────────────────────────────────────────
//
// A paper strip is ONE colour taken lighter and darker. The printer does it with
// white and black: the palest card is the strip's colour let down with white,
// the deepest is it with black (or a darker cut of the same colourant). So that
// is how a card is tested here — not "is its hue near the seed's", which is what
// ran reds into oranges into browns, but "is it what this colour looks like
// mixed toward white or black to that lightness". The mix is done in linear
// light, where mixing is physical, and judged in OKLab, where distance is
// perceptual.
//
// Mixing with white is not a hue-preserving move in any perceptual space — a
// red let down with white goes pinker, an orange goes toward peach, and both
// lose colour much faster than they gain lightness. That is why a hue window
// can't do this job: the pale end of a red strip sits at a different OKLCH hue
// from its base, and the pale end of the orange strip next door sits right on
// top of it. Following the mix puts each pale card where its own base sends it.

type Linear = readonly [number, number, number];
interface Oklab { L: number; a: number; b: number }

const WHITE: Linear = [1, 1, 1];

function hexToLinear(hex: string): Linear {
  const { r, g, b } = hexToRgb(hex);
  return [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
}

function linearToOklab([lr, lg, lb]: Linear): Oklab {
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLCH of a hex: L 0–1, C 0–~0.37, h in degrees. */
export function hexToOklch(hex: string): { L: number; C: number; h: number } {
  const { L, a, b } = linearToOklab(hexToLinear(hex));
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/**
 * What `base` looks like taken to lightness `L`: mixed toward white if that is
 * lighter, toward black if darker.
 *
 * Black is closed-form — scaling linear RGB by k scales every OKLab coordinate
 * by ∛k, so the mix to L is the base scaled by L/L_base. White is not, and is
 * found by bisection; lightness climbs monotonically with the amount of white.
 */
function mixedTo(base: Linear, baseLab: Oklab, L: number): Oklab {
  if (L <= baseLab.L) {
    const k = L / Math.max(baseLab.L, 1e-6);
    return { L, a: baseLab.a * k, b: baseLab.b * k };
  }
  let lo = 0;
  let hi = 1;
  let lab = baseLab;
  for (let i = 0; i < 20; i++) {
    const t = (lo + hi) / 2;
    lab = linearToOklab([
      base[0] + (WHITE[0] - base[0]) * t,
      base[1] + (WHITE[1] - base[1]) * t,
      base[2] + (WHITE[2] - base[2]) * t,
    ]);
    if (lab.L > L) hi = t;
    else lo = t;
  }
  return lab;
}

/**
 * How far a card sits from where the strip expects it (OKLab units), split into
 * a chroma part and a hue part. On the dark side, some extra colour over the
 * black mix counts only half: deep paints are made with more of the colourant,
 * not just with black, and hold their colour further down than a plain black
 * mix does. Only up to half as much again, though — past that it is a stronger
 * colour, not a deeper cut of this one.
 */
function offStrip(card: Oklab, expected: Oklab, darkSide: boolean): number {
  const cc = Math.hypot(card.a, card.b);
  const ce = Math.hypot(expected.a, expected.b);
  const all = (card.a - expected.a) ** 2 + (card.b - expected.b) ** 2;
  let dC = cc - ce;
  const dH2 = Math.max(0, all - dC * dC);
  if (darkSide && dC > 0) {
    const allowed = Math.min(dC, 0.5 * ce);
    dC = allowed * 0.5 + (dC - allowed);
  }
  return Math.sqrt(dC * dC + dH2);
}

/**
 * How far off the strip a card may sit. Tight where there is little colour —
 * two neighbouring strips' pale ends are only ~0.02 apart, and a warm cream on
 * top of a red strip is ~0.013 from the pink that belongs there — and wider on
 * the strong cards, where a brand's hex wanders more from any model and a wrong
 * neighbour is far further away. The floor sits above what rounding a
 * near-white to a hex can move it (~0.003).
 */
const stripTolerance = (chroma: number) => 0.006 + 0.14 * chroma;

/** The smallest lightness step between neighbouring cards (OKLab L, ≈ 3 L*).
 *  Closer than this and two cards read as the same colour printed twice. */
const STRIP_MIN_STEP = 0.03;
/** How far past the nearest candidate to look for the next card, and what
 *  reaching for one costs: a card 0.07 further on that sits right on the strip
 *  beats a nearer one that only just passes. Without the look-ahead, a gap in
 *  a strip was filled by whichever neighbouring strip had a card in it. */
const STRIP_LOOKAHEAD = 0.12;
const STRIP_REACH_COST = 5;
/** The largest lightness jump between neighbouring cards. A catalogue with
 *  nothing between a cream and a near-black has no strip there, and showing
 *  the two side by side as "one shade darker" is the thing that looked broken. */
const STRIP_MAX_STEP = 0.3;

interface StripColour { shade: PaintShade; lin: Linear; lab: Oklab; C: number }

const toStripColour = (shade: PaintShade): StripColour => {
  const lin = hexToLinear(shade.hex);
  const lab = linearToOklab(lin);
  return { shade, lin, lab, C: Math.hypot(lab.a, lab.b) };
};

/** How well `card` sits on the strip through `base` — the distance over the
 *  tolerance, so ≤ 1 belongs — or `null` when it doesn't. */
function stripFit(base: StripColour, card: StripColour): number | null {
  const expected = mixedTo(base.lin, base.lab, card.lab.L);
  const off = offStrip(card.lab, expected, card.lab.L < base.lab.L);
  const tol = stripTolerance(Math.max(card.C, Math.hypot(expected.a, expected.b)));
  return off <= tol ? off / tol : null;
}

/** Two bases whose lines pass this close to the seed (OKLab) fit equally —
 *  about what rounding a hex can move a colour — and the stronger is taken. */
const STRIP_BASE_TIE = 0.002;

/**
 * The strongest colour on the seed's strip — the card the rest of it is that
 * colour let down with white or black.
 *
 * The seed is often not it: a pale pink opens its strip at the TOP, and mixing
 * a pale pink with black gives grey, not the red below it on the card. So the
 * base is the most colourful card of which the seed is, closely, a tint or a
 * shade — or the seed, when nothing stronger fits.
 *
 * Closely, because this choice steers the whole strip: at the members' own
 * tolerance a grey-brown passes as a shade of the terracotta next door and the
 * strip follows it off into orange. So the seed must sit almost exactly on the
 * base's line — 40% of the members' tolerance, never under what rounding a pale
 * hex can move it — with no allowance for a deep card's extra colour, and the
 * base must be clearly stronger than the seed.
 *
 * And of the strong colours that fit, the one that fits BEST — not simply the
 * strongest. A pale tint sits within rounding of several strips' tops at once,
 * and the red next door is stronger than the terracotta whose tint the seed
 * actually is while fitting only a little worse; a deep shade lies on the black
 * line of every brighter colour of the same balance, and the brightest of those
 * is rarely the one it was cut from. Only where two fit equally (every card on
 * one white line does — a pale pink is as much a tint of the mid pink as of the
 * red) is the stronger taken, since that is the one the whole strip runs
 * through.
 *
 * A near-white doesn't look for one at all: its hue is too faint to say which
 * colour it is the top of, and it heads a strip of whites and greys.
 */
function stripBase(seed: StripColour, pool: ReadonlyArray<StripColour>): StripColour {
  if (seed.C < 0.01) return seed;
  const fits: { c: StripColour; off: number }[] = [];
  for (const c of pool) {
    if (c.C < seed.C * 1.25) continue;
    if (Math.abs(c.lab.L - seed.lab.L) < STRIP_MIN_STEP) continue;
    const expected = mixedTo(c.lin, c.lab, seed.lab.L);
    const tol = Math.max(0.004, 0.4 * stripTolerance(Math.max(seed.C, Math.hypot(expected.a, expected.b))));
    const off = offStrip(seed.lab, expected, false);
    if (off <= tol) fits.push({ c, off });
  }
  if (fits.length === 0) return seed;
  const closest = Math.min(...fits.map((f) => f.off));
  let best: StripColour | null = null;
  for (const f of fits) {
    if (f.off > closest + STRIP_BASE_TIE) continue;
    if (!best || f.c.C > best.C) best = f.c;
  }
  return best!;
}

/**
 * The lighter-to-darker strip a paper shade card would show for this shade:
 * the same colour taken lighter and darker, lightest first, `max` cards at
 * most, the seed always on it.
 *
 * Built outward from the seed one card at a time rather than by filtering and
 * slicing: each next card is at least {@link STRIP_MIN_STEP} lighter (or darker)
 * than the last, and of the colours in reach it is the one that sits closest to
 * the strip, a little further on if that buys a much better fit — so where two
 * strips' pale ends crowd together, each takes its own, and a catalogue with
 * thirty near-identical creams gives the strip one of them rather than six in a
 * row. The two sides are filled in turn so the seed sits near the middle.
 *
 * Ordered by the lightness of the colour ON SCREEN (the hex), not the brand's
 * measured LRV. The two disagree often enough — a hex is a screen approximation
 * — and a strip labelled lightest-to-darkest whose swatches visibly aren't is
 * the thing that makes it look broken.
 *
 * One company's shades where it can: a paper strip is one company's card, and
 * two companies' near-matches next to each other read as the same colour twice.
 * If the seed's company has nothing lighter or darker, the whole catalogue is
 * used rather than showing a strip of one.
 */
export function fanDeck(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  max = 9,
): PaintShade[] {
  const seed = toStripColour(shade);
  type Card = { shade: PaintShade; L: number; fit: number };

  // One side of the strip, outward from the seed.
  const walk = (cards: ReadonlyArray<Card>, dir: 1 | -1): PaintShade[] => {
    const out: PaintShade[] = [];
    let last = seed.lab.L;
    let i = 0;
    while (out.length < max) {
      while (i < cards.length && (cards[i]!.L - last) * dir < STRIP_MIN_STEP) i++;
      if (i >= cards.length || (cards[i]!.L - last) * dir > STRIP_MAX_STEP) break;
      const nearest = cards[i]!.L;
      let best = i;
      let bestScore = cards[i]!.fit;
      for (let j = i + 1; j < cards.length && (cards[j]!.L - nearest) * dir <= STRIP_LOOKAHEAD; j++) {
        const score = cards[j]!.fit + (cards[j]!.L - nearest) * dir * STRIP_REACH_COST;
        if (score < bestScore) { best = j; bestScore = score; }
      }
      out.push(cards[best]!.shade);
      last = cards[best]!.L;
      i = best + 1;
    }
    return out;
  };

  const build = (shades: ReadonlyArray<PaintShade>) => {
    const pool = shades.filter((c) => c.code !== shade.code).map(toStripColour);
    const base = stripBase(seed, pool);
    const lighter: Card[] = [];
    const darker: Card[] = [];
    for (const c of pool) {
      if (Math.abs(c.lab.L - seed.lab.L) < STRIP_MIN_STEP) continue;
      const fit = c === base ? 0 : stripFit(base, c);
      if (fit === null) continue;
      (c.lab.L > seed.lab.L ? lighter : darker).push({ shade: c.shade, L: c.lab.L, fit });
    }
    // Nearest to the seed first, on both sides.
    lighter.sort((a, b) => a.L - b.L);
    darker.sort((a, b) => b.L - a.L);
    return { up: walk(lighter, 1), down: walk(darker, -1) };
  };

  const sameCompany = catalogue.filter((c) => c.brand === shade.brand);
  let { up, down } = build(sameCompany);
  if (up.length + down.length === 0 && sameCompany.length < catalogue.length) {
    ({ up, down } = build(catalogue));
  }

  // Alternate sides so the seed sits near the middle; a side that runs out
  // hands its room to the other.
  let nUp = 0;
  let nDown = 0;
  while (nUp + nDown + 1 < max && (nUp < up.length || nDown < down.length)) {
    if (nUp < up.length && (nUp <= nDown || nDown >= down.length)) nUp++;
    else nDown++;
  }
  return [...up.slice(0, nUp).reverse(), shade, ...down.slice(0, nDown)];
}

/** Both fan-deck steps around the seed from ONE strip build — the dock needs
 *  lighter AND darker on every shade change, and each fanDeck call is a full
 *  catalogue filter + sort, so computing them together halves that work. */
export function fanDeckNeighbors(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
): { lighter?: PaintShade; darker?: PaintShade } {
  // Use a generous strip so stepping never dead-ends because of windowing.
  const strip = fanDeck(shade, catalogue, 999);
  const i = strip.findIndex((s) => s.code === shade.code);
  if (i < 0) return {};
  return { lighter: strip[i - 1], darker: strip[i + 1] };
}

/** The next strip entry one step lighter (-1) or darker (+1), if any. */
export function stepInFanDeck(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  direction: -1 | 1,
): PaintShade | undefined {
  const { lighter, darker } = fanDeckNeighbors(shade, catalogue);
  return direction === -1 ? lighter : darker;
}

// ── Lamplight shift ("changes under light") ────────────────────────────────

export interface LightShift {
  /** How much MORE this colour moves under a warm lamp than a grey would. */
  score: number;
  /** Approximate appearance under a warm household lamp, for a mini preview. */
  warmHex: string;
}

/** Shades scoring at or above this get the "changes under light" badge. */
export const LIGHT_SHIFT_BADGE = 6;

/**
 * Approximate how a colour moves between daylight and a warm bulb. We scale
 * the linear channels toward incandescent, then measure the CHROMATIC
 * displacement relative to how a neutral grey of the same lightness moves —
 * greys shift too, but eyes adapt to that; what surprises people is a shade
 * shifting differently from the room around it.
 */
export function lightShift(hex: string): LightShift {
  const warm = (h: string) => {
    const { r, g, b } = hexToRgb(h);
    return { r: Math.min(255, r * 1.08), g: g * 0.99, b: b * 0.78 };
  };
  const lab = hexToLab(hex);
  const shifted = rgbToLab(warm(hex));
  // A grey with roughly the same lightness, pushed through the same lamp.
  const greyLevel = Math.round((hexToRgb(hex).r + hexToRgb(hex).g + hexToRgb(hex).b) / 3);
  const greyHex = rgbToHex({ r: greyLevel, g: greyLevel, b: greyLevel });
  const grey = hexToLab(greyHex);
  const greyShifted = rgbToLab(warm(greyHex));
  const da = shifted.a - lab.a - (greyShifted.a - grey.a);
  const db = shifted.b - lab.b - (greyShifted.b - grey.b);
  return {
    score: Math.hypot(da, db),
    warmHex: rgbToHex(warm(hex)),
  };
}

// ── Sun fade (exterior) ────────────────────────────────────────────────────

/**
 * Deep, saturated reds, violets and blues are the classic fast-faders on
 * sun-facing exterior walls (organic red/violet pigments break down first).
 */
export function sunFadeRisk(shade: PaintShade): boolean {
  const lab = hexToLab(shade.hex);
  if (chroma(lab) < 22 || shade.lrv > 35) return false;
  const h = labHue(lab);
  return h < 45 || h >= 240; // deep reds/pinks and blues/violets
}

/** Nearby shades that hold up better in the sun: lighter or less saturated. */
export function fadeSaferAlternatives(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  n = 2,
): PaintShade[] {
  const seed = hexToLab(shade.hex);
  const seedHue = labHue(seed);
  const seedChroma = chroma(seed);
  // Distance is computed once per candidate, not inside the comparator — a
  // ΔE per comparison over a 10k catalogue made this sort needlessly heavy.
  return catalogue
    .reduce<Array<{ shade: PaintShade; d: number }>>((acc, c) => {
      if (c.code === shade.code) return acc;
      const lab = hexToLab(c.hex);
      if (hueDistance(labHue(lab), seedHue) > 30) return acc;
      const lighter = c.lrv >= shade.lrv + 10;
      const calmer = chroma(lab) <= seedChroma - 8;
      if (lighter || calmer) acc.push({ shade: c, d: deltaE(lab, seed) });
      return acc;
    }, [])
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.shade);
}

// ── Ceiling + trim pairing ─────────────────────────────────────────────────

export interface SurfacePairing {
  ceiling?: PaintShade;
  trim?: PaintShade;
}

const TINT_FOR_TEMP: Record<Temperature, ReadonlyArray<WhiteTint>> = {
  warm: ["warm", "pinkish", "neutral"],
  cool: ["cool", "greenish", "neutral"],
  neutral: ["neutral", "warm", "cool"],
};

/**
 * One ceiling white and one trim colour whose undertones sit comfortably with
 * the chosen wall shade: the ceiling is the brightest white on the wall's
 * warm/cool side; the trim is a quiet low-chroma colour with clear contrast
 * (darker trim for a light wall, lighter trim for a dark wall).
 */
export function pairCeilingAndTrim(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
): SurfacePairing {
  const temp = temperature(shade.hex);
  const whites = catalogue.filter((s) => isWhiteShade(s) && s.code !== shade.code);
  const preferredTints = TINT_FOR_TEMP[temp];
  // Rank each white's tint once, not per comparison — whiteTint re-derives Lab
  // and the whites pool can hold hundreds of shades.
  const ceiling = whites
    .map((s) => {
      const r = preferredTints.indexOf(whiteTint(s.hex));
      return { shade: s, rank: r === -1 ? 99 : r };
    })
    .sort((a, b) => a.rank - b.rank || b.shade.lrv - a.shade.lrv)[0]?.shade;

  const trimTargetLrv = shade.lrv >= 50 ? 25 : 70;
  const trim =
    catalogue
      .filter((c) => {
        if (c.code === shade.code || c.code === ceiling?.code) return false;
        const lab = hexToLab(c.hex);
        if (chroma(lab) > 18) return false; // trim stays quiet
        const t = temperature(c.hex);
        return t === "neutral" || t === temp || temp === "neutral";
      })
      .sort(
        (a, b) => Math.abs(a.lrv - trimTargetLrv) - Math.abs(b.lrv - trimTargetLrv),
      )[0];

  return { ceiling, trim };
}

// ── Competitor-code closeness ──────────────────────────────────────────────

export type Closeness = "Very close" | "Close" | "Not exact";

/** Plain-words rating for a ΔE76 distance, for the counter screen. */
export function closenessRating(d: number): Closeness {
  if (d <= 3) return "Very close";
  if (d <= 6) return "Close";
  return "Not exact";
}
