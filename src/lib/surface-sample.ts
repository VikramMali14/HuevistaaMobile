// Ported from HueVistaFrontEnd/src/lib/surface-sample.ts — keep the two in step.
/**
 * Reading the colour of a SURFACE out of a photograph, rather than the value of a pixel.
 *
 * The counter's complaint that this exists to answer: clicking two spots on the same wall
 * gave two different shades. Both readings were accurate and both were useless, because a
 * pixel is not what anybody is pointing at. Three separate things make one wall report
 * many colours, and they need three different answers:
 *
 *  1. NOISE AND TEXTURE. Sensor noise, JPEG blocking and the grain of the paint itself move
 *     a single pixel by several ΔE from its neighbour. Answer: average an area, not a
 *     point — {@link samplePatch}.
 *
 *     How LARGE an area is not a free choice, and a small patch is not enough. Averaging n
 *     samples of independent noise cuts the error by sqrt(n) — but JPEG shares its
 *     quantisation error across a block, so what counts is not how many pixels the average
 *     covers, it is how many BLOCKS. A patch a few blocks wide is averaging four or five
 *     independent things and loses: at the patch size this module shipped with, two clicks
 *     on one flat JPEG-compressed wall landed 12 ΔE apart, which is a different row on a
 *     fan deck and the original complaint intact. The area has to be wide, and the only
 *     way to make a wide average safe next to an edge is to gate it on colour rather than
 *     on distance — see {@link samplePatch}.
 *
 *  2. EDGES AND HIGHLIGHTS INSIDE THAT PATCH. A patch that straddles the skirting board, a
 *     shadow line or a specular glare averages into a colour that exists nowhere in the
 *     room. Answer: average robustly — take the patch's median as the centre, throw away
 *     what disagrees with it, and average what is left. A plain mean is what turns an edge
 *     into an invented colour.
 *
 *  3. UNEVEN LIGHTING ACROSS THE ROOM. The same wall is lighter by the window and darker in
 *     the corner, so the same paint reads as two shades several steps apart on a fan deck.
 *     Answer: divide the slow lighting gradient out before sampling — {@link evenLighting}.
 *
 *     The trap here is that a photograph's slow variation is not all lighting. A picture of
 *     one wall is all one material, so "normalise everything towards the middle" happens to
 *     be right. A picture of a whole BUILDING is not: sky, painted storey, cream tower,
 *     forecourt: normalising those towards a common middle lifts the wall, pushes the tower
 *     down and ramps between them, and on an evenly lit facade that invented a 13.7 ΔE
 *     spread across a wall that had none. The correction therefore normalises each surface
 *     towards ITS OWN level and never towards another surface's — see {@link evenLighting}.
 *
 * What this deliberately does NOT do is white-balance the photograph. Grey-world and its
 * relatives assume the average of a scene is neutral, and the photographs this tool is
 * pointed at are the exact case that breaks: a wall fills the frame, so "the average is
 * grey" says the wall is grey. A genuinely red room would be corrected into a beige one and
 * the shop would be handed the wrong tin. Removing a colour cast is a real problem and it
 * needs a grey card or an EXIF illuminant, not a guess made from the subject itself.
 *
 * {@link evenLighting} is therefore strictly luminance-only: every pixel's three channels
 * are multiplied by the SAME gain in linear light, so the ratio between them — the
 * chromaticity, which is the hue and the saturation — comes out exactly as it went in. Only
 * lightness moves. That is the honest reading of "take the lighting out": it cannot invent
 * a hue, and the worst it can do is report a wall slightly lighter or darker than it is.
 *
 * Everything here is pure and takes plain pixel buffers, so it is testable without a canvas.
 */

import { deltaE, hexToLab, labToHex, rgbToHex, rgbToLab, type Lab, type RGB } from "./color";

// ── Reading a patch ────────────────────────────────────────────────────────

/** What one reading of a surface came back with. */
export interface SurfaceSample {
  /** The surface's colour, as the matcher should see it. */
  hex: string;
  /**
   * Pixels of the anchor patch that read as the same surface as its median.
   *
   * Always {@link uniformity} times {@link considered} — it is the count that ratio is
   * derived from, and it describes the spot under the cursor, never the wider average.
   */
  kept: number;
  /** Pixels that were eligible to be counted at all — the patch less anything blown out
   *  or crushed to black, neither of which carries a usable colour. */
  considered: number;
  /**
   * Pixels that went into the reported colour.
   *
   * Larger than {@link considered}, usually much larger: the anchor patch decides WHICH
   * surface is being read, and the average is then taken over a far wider area of that
   * same surface. See {@link samplePatch}.
   */
  averaged: number;
  /**
   * How much of the anchor patch was one colour, 0-1.
   *
   * Low means the reading straddles something: an edge, a shadow line, a glare. The colour
   * is still the best available answer for the dominant surface under the cursor, but it is
   * worth telling the counter to aim at a flatter piece of wall.
   */
  uniformity: number;
}

/**
 * Pixels this bright in ANY channel are clipped: the sensor ran out of range, so the
 * channel says "at least this" rather than a value, and the ratio between the three — which
 * is the entire colour — is wrong. A glare spot on gloss paint is all of these.
 */
const CLIPPED_AT = 250;

/**
 * And this dark in EVERY channel is crushed, where the same thing has happened at the other
 * end: below about this level the chroma is buried in noise and the pixel reports a colour
 * it does not have.
 */
const CRUSHED_AT = 8;

/** Ignore anything meaningfully transparent — a PNG cut-out has nothing behind it. */
const OPAQUE_AT = 200;

/**
 * How far from the patch's median a pixel may sit and still count, in ΔE76.
 *
 * Chosen against what the two failure modes actually measure. Sensor noise and paint grain
 * on one flat wall sit inside a couple of ΔE; the gap across a real edge — wall to skirting,
 * wall to shadow — is much larger than this. Somewhere between the two is a wide, forgiving
 * band, and 10 is in the middle of it.
 */
const AGREE_WITHIN = 10;

/** Below this many survivors the trim has stopped being a filter and started being a
 *  guess, so the untrimmed patch is the better answer. */
const MIN_KEPT = 6;

/**
 * How much wider than the anchor patch the colour is averaged over.
 *
 * Set by what it has to beat. Noise correlated over a JPEG block only averages down as the
 * square root of the number of BLOCKS covered, so the area has to grow by a large factor to
 * help at all: eight times the radius is sixty-four times the area, which is the difference
 * between averaging four independent things and averaging a couple of hundred.
 *
 * It is not free, and the cost is named here rather than buried. Two DIFFERENT paints closer
 * together than {@link AGREE_WITHIN} cannot be told apart by the gate, so a reading taken
 * near the seam between them blends a little of the neighbour in — about 1.5 ΔE, measured,
 * where the two paints are 8 ΔE apart. That is the trade: a small error in the rare case of
 * two nearly identical paints meeting, against a 12 ΔE error on every JPEG of one wall.
 */
const WIDEN = 8;

/**
 * Roughly how many samples across the wide area is walked, whatever the photograph's size.
 *
 * Exported for the test that puts a ceiling on the work a single reading does — nothing else
 * would notice the walk going dense, because it costs no accuracy, only time.
 *
 * A fixed GRID rather than a fixed step, so the cost of a reading does not grow with the
 * megapixels — this runs on every mousemove, and the patch radius is already proportional to
 * the image, so a fixed step would quadruple the work on a large photo for nothing.
 *
 * Nothing is lost by walking it sparsely. Every pixel inside one noise block carries the same
 * noise, so reading all of them says no more about it than reading one; what the average needs
 * from the area is reach, not density.
 */
export const WIDE_SAMPLES_ACROSS = 24;

/**
 * How many times the average is recomputed about its own result.
 *
 * Without this the wide average is gated against the ANCHOR's median, and the anchor is small
 * enough that its median carries most of the noise the wide area exists to remove — so the
 * gate quietly drags the answer back to the noisy estimate it was supposed to improve on.
 * Re-centring on the average and gating again lets it settle on the surface instead. It is
 * most of the benefit: on an 8px-block wall it takes two clicks from 5.3 ΔE apart to 1.9.
 *
 * Two passes, because a third changes nothing measurable. Each one re-gates the samples
 * already collected, so they cost arithmetic and no further pixel reads.
 */
const RECENTRINGS = 2;

/**
 * The radius of the patch, as a fraction of the image's smaller side.
 *
 * Proportional rather than fixed so the sampled area is the same piece of WALL whatever the
 * photo's resolution — a fixed 8px patch reads a postage stamp on a 12MP phone photo and a
 * whole doorway on a small one.
 */
const PATCH_FRACTION = 0.012;
const PATCH_MIN = 4;
const PATCH_MAX = 18;

/** The patch radius this image should be read with, in pixels. */
export function patchRadius(width: number, height: number): number {
  const r = Math.round(Math.min(width, height) * PATCH_FRACTION);
  return Math.max(PATCH_MIN, Math.min(PATCH_MAX, r));
}

/**
 * The colour of the surface under (cx, cy).
 *
 * Two stages, because the two things being asked for pull in opposite directions. Deciding
 * WHICH surface is under the cursor wants a small area — a wide one would have swallowed the
 * skirting board before the question was even asked. Averaging the noise off that surface
 * wants the widest area it can get, for the reason in the module note: correlated noise only
 * falls as the square root of the blocks covered, and a small patch does not cover enough.
 *
 * So the small patch answers the first question and nothing else. Its per-channel median
 * locates the dominant surface, and it is the median that makes this robust — unmoved by up
 * to half the patch being something else, where a mean is dragged by every outlier in
 * proportion to how far off it is.
 *
 * That median then becomes the anchor for the second stage, which walks {@link WIDEN} times
 * the radius and keeps only what is within {@link AGREE_WITHIN} of it. The gate is on colour,
 * not on distance, which is what makes the wide area safe: a skirting board four patch-widths
 * away is excluded for being a different colour, not for being far, while every block of the
 * same wall is averaged in however far out it sits.
 *
 * The average is then re-centred on itself and gated again, {@link RECENTRINGS} times, because
 * a gate centred on the anchor's median inherits the anchor's noise and hands it back — see
 * that constant. What comes back is a reading of one surface, taken over enough of it to mean
 * something.
 *
 * Returns null only when the point is outside the image.
 */
export function samplePatch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius = patchRadius(width, height),
): SurfaceSample | null {
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;

  const anchor = eligibleLabs(data, width, height, cx, cy, radius, 1);

  if (anchor.length === 0) {
    // Every pixel around here is blown out or crushed — a window, a lamp, a black corner.
    // The honest answer is the pixel itself, reported as completely non-uniform so the
    // caller can say the reading is unreliable rather than quoting it as a wall colour.
    const o = (cy * width + cx) * 4;
    return {
      hex: rgbToHex({ r: data[o]!, g: data[o + 1]!, b: data[o + 2]! }),
      kept: 1,
      considered: 1,
      averaged: 1,
      uniformity: 0,
    };
  }

  const centre: Lab = {
    L: medianOf(anchor.map((l) => l.L)),
    a: medianOf(anchor.map((l) => l.a)),
    b: medianOf(anchor.map((l) => l.b)),
  };

  // How much of the ANCHOR was one colour — the question "is the counter pointing at one
  // thing", which is about the spot under the cursor and not about the wide average. Recorded
  // before the fallback below and never recomputed after it: the fallback changes which
  // pixels get averaged, not how mixed the spot was, and reporting the widened count would
  // have the most mixed readings of all — the ones that triggered it — come back claiming
  // perfect uniformity.
  let kept = 0;
  for (const lab of anchor) if (deltaE(lab, centre) <= AGREE_WITHIN) kept++;
  const uniformity = kept / anchor.length;
  // So `uniformity === kept / considered` always holds, including through the fallback
  // below, which changes what is averaged and not how mixed the spot was.

  const wideRadius = radius * WIDEN;
  const wide = eligibleLabs(
    data, width, height, cx, cy, wideRadius,
    Math.max(1, Math.round((2 * wideRadius) / WIDE_SAMPLES_ACROSS)),
  );

  let surface = centre;
  let averaged = 0;
  for (let pass = 0; pass <= RECENTRINGS; pass++) {
    let sumL = 0, sumA = 0, sumB = 0, n = 0;
    for (const lab of wide) {
      if (deltaE(lab, surface) > AGREE_WITHIN) continue;
      sumL += lab.L; sumA += lab.a; sumB += lab.b; n++;
    }
    // Too little agrees to average. Keep the last estimate that did and stop — a handful of
    // survivors is a guess, and re-centring on a guess walks the answer somewhere arbitrary.
    if (n < MIN_KEPT) break;
    surface = { L: sumL / n, a: sumA / n, b: sumB / n };
    averaged = n;
  }

  if (averaged === 0) {
    // Nothing out there agreed with the anchor even once, which means the anchor has no
    // dominant surface either: it is mostly edge, and its median landed between two colours
    // rather than on one. Averaging the whole patch is no worse than averaging an arbitrary
    // handful of it, and `uniformity` still says the reading is of more than one thing.
    let sumL = 0, sumA = 0, sumB = 0;
    for (const lab of anchor) { sumL += lab.L; sumA += lab.a; sumB += lab.b; }
    surface = { L: sumL / anchor.length, a: sumA / anchor.length, b: sumB / anchor.length };
    averaged = anchor.length;
  }

  return { hex: labToHex(surface), kept, considered: anchor.length, averaged, uniformity };
}

/**
 * The eligible pixels of a box around (cx, cy), as Lab, walking every `step`th one.
 *
 * Eligible means carrying a usable colour: opaque, not clipped at the top of the sensor's
 * range, not crushed at the bottom. The grid is aligned so the cursor's own pixel is always
 * on it whatever the step, so a reading never drifts off the thing being pointed at.
 */
function eligibleLabs(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  step: number,
): Lab[] {
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(width - 1, cx + radius);
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(height - 1, cy + radius);

  const labs: Lab[] = [];
  for (let y = y0 + ((cy - y0) % step); y <= y1; y += step) {
    for (let x = x0 + ((cx - x0) % step); x <= x1; x += step) {
      const o = (y * width + x) * 4;
      if (data[o + 3]! < OPAQUE_AT) continue;
      const r = data[o]!, g = data[o + 1]!, b = data[o + 2]!;
      if (r >= CLIPPED_AT || g >= CLIPPED_AT || b >= CLIPPED_AT) continue;
      if (r <= CRUSHED_AT && g <= CRUSHED_AT && b <= CRUSHED_AT) continue;
      labs.push(rgbToLab({ r, g, b }));
    }
  }
  return labs;
}

/** Below this share of the patch agreeing, the reading is of more than one thing and the
 *  counter should be told to aim somewhere flatter. */
export const MIXED_BELOW = 0.55;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// ── Taking the lighting out ───────────────────────────────────────────────

/**
 * The lighting field is estimated on a coarse grid. Small enough that it is genuinely
 * low-frequency — it must describe how the light falls across the ROOM and know nothing
 * about where one wall stops and the next begins, or it would flatten the difference
 * between two different paints and report them as one colour.
 */
const FIELD_CELLS = 12;

/**
 * Smoothing passes over that grid.
 *
 * One, where a plain blur needed two. The second pass was there to stop a cell that happens
 * to contain a dark wardrobe from punching a bright hole in the corrected image, and the
 * weighting now does that job better: the wardrobe is a different level from the wall around
 * it, so it is down-weighted out of its neighbours' estimates instead of being averaged into
 * them. Measured, the wall beside a wardrobe comes back exactly right at either setting.
 *
 * Which leaves accuracy to decide it, and blurring an estimate of a gradient flattens the
 * gradient: at two passes the two ends of a lit wall still read 1.5 ΔE apart after
 * correction, at one pass 0.6.
 */
const FIELD_SMOOTHINGS = 1;

/**
 * How far the correction may push a pixel.
 *
 * The clamp is the whole safety argument. Uncapped, this would happily "correct" a photo of
 * a white ceiling above a navy wall into two mid-greys — the field cannot tell a dark PAINT
 * from a dark ROOM, and neither can any method that only looks at the image. Capped, the
 * most it can do to a genuinely dark surface is lighten it by about half a step, while
 * still removing the two-to-one falloff that a window at one end of a wall produces.
 */
const GAIN_MIN = 0.7;
const GAIN_MAX = 1.45;

/** A floor under the field so a near-black cell does not divide two rounding errors by
 *  each other and report enormous gain — the same guard `canvas-light` puts under its
 *  relief ratio, for the same reason. */
const FIELD_FLOOR = 0.004;

/**
 * How different two cells' chromaticity may be and still count as the same surface.
 *
 * Chromaticity — each channel's share of the three, in linear light — is what illumination
 * leaves alone: shine twice as much neutral light on a wall and every channel doubles, so the
 * shares do not move. Two cells with the same shares are therefore the same paint under
 * different light, and two with different shares are different materials however similar
 * their brightness. That is the cue that lets the correction tell "this end of the wall is in
 * shadow" from "that is the sky".
 *
 * Measured on a facade: the painted storey sits 0.09-0.15 from the sky, the tower and the
 * forecourt, and about 0.005 from another shade of the same paint. Anywhere between those is
 * a wide, forgiving band.
 */
const CHROMA_TOL = 0.035;

/**
 * How different two neighbouring cells' levels may be, as |log ratio|, and still be smoothed
 * together when estimating the light.
 *
 * Illumination falls off gradually, so between two adjacent cells of one wall it barely
 * changes; a step from wall to sky is abrupt. Blurring across the step is what ramps one
 * surface's level into another's, so the smoothing is stopped there.
 */
const SMOOTH_LEVEL_TOL = 0.55;

/**
 * And the same idea for deciding what a surface's OWN typical level is, which is a laxer
 * question and needs a laxer tolerance.
 *
 * It has to span the whole surface however it is lit — the far, sunlit end of a wall is still
 * that wall, and excluding it would leave the gradient uncorrected — while still separating
 * two materials that chromaticity alone cannot, which is the near-neutral case: grey concrete
 * and cream render sit 0.013 apart in chromaticity and merge, and the forecourt then gets
 * dragged to the clamp by a tower two and a half times brighter.
 *
 * Measured: a material step of that kind is a log ratio around 0.9-1.2, and an indoor or
 * facade lighting falloff is 0.4 or below. 0.8 sits between them — it put the forecourt back
 * within 0.4 ΔE of its real colour without costing the wall anything.
 */
const REFERENCE_LEVEL_TOL = 0.8;

/**
 * A copy of the image with the slow lighting gradient divided out.
 *
 * Luminance-only, and that is the point: the gain at a pixel is one number applied to all
 * three channels in LINEAR light, so r:g:b — the chromaticity — is mathematically unchanged
 * and only lightness moves. It cannot turn a red wall beige. See the module note on why
 * white balance is not attempted alongside it.
 *
 * Every surface is normalised towards its OWN typical level, never towards another surface's.
 * That distinction is the whole of what makes this work on a photograph of a building rather
 * than only on a photograph of a wall: {@link CHROMA_TOL} decides which cells are showing the
 * same material, each cell's gain is then its material's level over the light estimated at
 * that cell, and a surface that is evenly lit therefore asks for a gain of exactly 1 and is
 * left alone. It cannot pull the wall up because the sky is bright.
 *
 * What it still cannot do is separate two materials that share a chromaticity AND cover very
 * different shares of the frame — a pale patch in the corner of a dark wall of the same hue
 * will be pulled towards the dark. The gain clamp is what bounds that, as it always was.
 *
 * The original buffer is not modified; the photograph the counter is looking at stays the
 * photograph they took, and only what is SAMPLED off it is corrected.
 */
export function evenLighting(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  if (width < 2 || height < 2) return out;

  const cells = FIELD_CELLS;
  const gain = gainField(data, width, height, cells);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= cells ? cells - 1 : x;
    const cy = y < 0 ? 0 : y >= cells ? cells - 1 : y;
    return gain[cy * cells + cx]!;
  };

  for (let y = 0; y < height; y++) {
    // Cell-space coordinate of this row's centre, for the bilinear lookup below.
    const fy = ((y + 0.5) / height) * cells - 0.5;
    const y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = ((x + 0.5) / width) * cells - 0.5;
      const x0 = Math.floor(fx), tx = fx - x0;
      // Interpolated so the correction has no visible cell seams in it. The gains are
      // clamped before they get here, so no blend of them can escape the clamp either.
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      const k = top * (1 - ty) + bottom * ty;

      const o = (y * width + x) * 4;
      // Gain is a physical scaling of light, so it belongs in linear space. Applying it to
      // the gamma-encoded bytes instead would change the hue as well as the lightness,
      // which is exactly the thing this promises not to do.
      out[o] = encode(linear(data[o]!) * k);
      out[o + 1] = encode(linear(data[o + 1]!) * k);
      out[o + 2] = encode(linear(data[o + 2]!) * k);
      out[o + 3] = data[o + 3]!;
    }
  }
  return out;
}

/** What one grid cell of the scene shows: how much light, and what the surface is. */
interface Cells {
  /** Median linear luminance, unsmoothed. */
  level: Float32Array;
  /** Median chromaticity — each channel's share of the three, in linear light. */
  chromaR: Float32Array;
  chromaG: Float32Array;
  /** log(level), kept because every comparison below wants the ratio of two levels and
   *  a difference of logs is one subtraction where a ratio is a division and a log. */
  logLevel: Float32Array;
}

/**
 * The scene on a coarse grid: one light level and one chromaticity per cell.
 *
 * Medians, not means, throughout: a cell containing a picture frame or a dark socket should
 * report the light falling on that part of the room, and a median ignores a minority of dark
 * pixels where a mean is dragged down by them and would then brighten that whole area.
 */
function cellStats(data: Uint8ClampedArray, width: number, height: number, cells: number): Cells {
  const levels: number[][] = Array.from({ length: cells * cells }, () => []);
  const reds: number[][] = Array.from({ length: cells * cells }, () => []);
  const greens: number[][] = Array.from({ length: cells * cells }, () => []);

  // Every pixel of a 12MP photo through a median would be slow and is not needed: the grid
  // is 144 cells, so a sparse walk gives the same answer for a fraction of the work.
  const step = Math.max(1, Math.round(Math.min(width, height) / 256));
  for (let y = 0; y < height; y += step) {
    const cy = Math.min(cells - 1, Math.floor((y / height) * cells));
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * 4;
      if (data[o + 3]! < OPAQUE_AT) continue;
      const r = linear(data[o]!), g = linear(data[o + 1]!), b = linear(data[o + 2]!);
      const i = cy * cells + Math.min(cells - 1, Math.floor((x / width) * cells));
      levels[i]!.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const total = r + g + b;
      // Near-black carries no usable chromaticity, only the ratio of three rounding errors.
      if (total > FIELD_FLOOR) { reds[i]!.push(r / total); greens[i]!.push(g / total); }
    }
  }

  // A cell with nothing in it (fully transparent, or a step that missed) is filled from the
  // image's overall level rather than with zero, which would read as a black corner and
  // send the gain to its ceiling for that whole region.
  const seen = levels.filter((b) => b.length > 0).map((b) => medianOf(b));
  const overall = seen.length > 0 ? medianOf(seen) : 0;

  const level = new Float32Array(cells * cells);
  const chromaR = new Float32Array(cells * cells);
  const chromaG = new Float32Array(cells * cells);
  const logLevel = new Float32Array(cells * cells);
  for (let i = 0; i < level.length; i++) {
    level[i] = levels[i]!.length > 0 ? medianOf(levels[i]!) : overall;
    logLevel[i] = Math.log(Math.max(level[i]!, FIELD_FLOOR));
    // Neutral is the honest default for a cell with no colour to report: it matches
    // everything about equally rather than picking a side.
    chromaR[i] = reds[i]!.length > 0 ? medianOf(reds[i]!) : 1 / 3;
    chromaG[i] = greens[i]!.length > 0 ? medianOf(greens[i]!) : 1 / 3;
  }
  return { level, chromaR, chromaG, logLevel };
}

/** How much two cells look like the same material, 0-1. */
function alike(c: Cells, i: number, j: number): number {
  const dr = c.chromaR[i]! - c.chromaR[j]!, dg = c.chromaG[i]! - c.chromaG[j]!;
  return Math.exp(-(dr * dr + dg * dg) / (CHROMA_TOL * CHROMA_TOL));
}

/** How close two cells' light levels are, 0-1, on a given |log ratio| tolerance. */
function alikeLevel(c: Cells, i: number, j: number, tol: number): number {
  const ratio = c.logLevel[i]! - c.logLevel[j]!;
  return Math.exp(-(ratio * ratio) / (tol * tol));
}

/**
 * The scene's lighting, as one linear-luminance value per grid cell.
 *
 * Smoothed among cells that look like the same surface at a similar level, so the estimate
 * describes how the light falls ACROSS a surface and stops at its edges. A plain blur is what
 * ramps the sky's brightness down into the top of a wall and then reports it as lighting.
 *
 * Exported for the tests, which check the field itself rather than only its effect.
 */
export function lightField(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cells = FIELD_CELLS,
): Float32Array {
  return smoothWithinSurface(cellStats(data, width, height, cells), cells);
}

/** Repeated 3x3 blur, weighted so it does not cross from one surface to another. */
function smoothWithinSurface(c: Cells, cells: number): Float32Array {
  let src = Float32Array.from(c.level);
  for (let pass = 0; pass < FIELD_SMOOTHINGS; pass++) {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const i = y * cells + x;
        let sum = 0, weight = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= cells) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= cells) continue;
            const j = yy * cells + xx;
            const w = alike(c, i, j) * alikeLevel(c, i, j, SMOOTH_LEVEL_TOL);
            sum += w * src[j]!;
            weight += w;
          }
        }
        dst[i] = weight > 0 ? sum / weight : src[i]!;
      }
    }
    src = dst;
  }
  return src;
}

/**
 * The gain each cell should be scaled by: its own surface's typical level over the light
 * estimated at that cell.
 *
 * The reference is a WEIGHTED MEDIAN over every cell in the photograph, weighted by how much
 * each looks like the same surface. Two things make that the right shape. A median is
 * unmoved by a minority of cells that slipped through the weighting, where a mean would be
 * dragged by them in proportion to how far off they are. And it is self-anchored: a cell
 * weighs its own material at 1 against itself, so with two comparable surfaces of one hue in
 * frame each one's reference lands in its own group and both are left alone, rather than
 * both being pulled to a shared middle and reported as one colour.
 */
function gainField(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cells: number,
): Float32Array {
  const c = cellStats(data, width, height, cells);
  const local = smoothWithinSurface(c, cells);
  const n = cells * cells;

  // Sorted once: the order is by level and does not depend on which cell is asking.
  const byLevel = Array.from({ length: n }, (_, i) => i)
    .filter((i) => c.level[i]! > FIELD_FLOOR)
    .sort((i, j) => c.level[i]! - c.level[j]!);

  const gain = new Float32Array(n);
  const weights = new Float32Array(byLevel.length);
  for (let i = 0; i < n; i++) {
    gain[i] = 1;
    if (!(local[i]! > FIELD_FLOOR) || byLevel.length === 0) continue;

    // Computed once and reused for the total and the accumulate — the weighted median needs
    // to walk the cells twice and the weights are not cheap.
    let total = 0;
    for (let k = 0; k < byLevel.length; k++) {
      const j = byLevel[k]!;
      const w = alike(c, i, j) * alikeLevel(c, i, j, REFERENCE_LEVEL_TOL);
      weights[k] = w;
      total += w;
    }
    if (!(total > 0)) continue;

    let acc = 0, reference = c.level[i]!;
    for (let k = 0; k < byLevel.length; k++) {
      acc += weights[k]!;
      if (acc >= total / 2) { reference = c.level[byLevel[k]!]!; break; }
    }
    if (!(reference > FIELD_FLOOR)) continue;

    const k = reference / local[i]!;
    gain[i] = k < GAIN_MIN ? GAIN_MIN : k > GAIN_MAX ? GAIN_MAX : k;
  }
  return gain;
}


/** sRGB byte to linear light, and back. Local copies rather than imports because these run
 *  per channel per pixel over a few million pixels, and the 256-entry table pays for
 *  itself many times over on the way in. */
const LINEAR: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const n = i / 255;
    t[i] = n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  }
  return t;
})();

function linear(byte: number): number {
  return LINEAR[byte]!;
}

/**
 * The way back out, as a table too.
 *
 * {@link evenLighting} calls this three times for every pixel, and a 12MP photograph is
 * twelve million Math.pow calls on the way out — enough to stall the tab for a noticeable
 * beat right after the counter drops a photo in. The table is finer than the byte it
 * produces, so quantising to it costs nothing that survives the round to 0-255.
 */
const ENCODE_STEPS = 4096;
const ENCODED: Float32Array = (() => {
  const t = new Float32Array(ENCODE_STEPS + 1);
  for (let i = 0; i <= ENCODE_STEPS; i++) {
    const n = i / ENCODE_STEPS;
    t[i] = (n <= 0.0031308 ? 12.92 * n : 1.055 * Math.pow(n, 1 / 2.4) - 0.055) * 255;
  }
  return t;
})();

function encode(v: number): number {
  const n = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return ENCODED[Math.round(n * ENCODE_STEPS)]!;
}

/**
 * How far apart two readings of the same spot are, in ΔE76 — used to decide whether the
 * lighting correction actually changed anything worth telling the counter about.
 */
export function shiftBetween(a: string, b: string): number {
  return deltaE(hexToLab(a), hexToLab(b));
}

/** A reading changed by less than this is the same colour as far as anyone can see, and
 *  saying "we adjusted it" would be noise. Roughly the threshold a trained eye detects. */
export const NOTICEABLE_SHIFT = 1.5;

/** Re-export so callers sampling a raw pixel (the fallback path) speak one vocabulary. */
export type { RGB };
