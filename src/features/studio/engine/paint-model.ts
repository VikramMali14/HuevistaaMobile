import { hexToRgb } from "@/lib/color";
import { lrvCorrectedRgb01 } from "@/lib/color-science";

import type { Readback, RegionPaint } from "./recolor-gl";

/**
 * The website studio's fixed render settings (visualizer.tsx): the paint follows the
 * photo's own light at 85%; detected walls grow by one photo pixel to hide the seam,
 * walls drawn by hand sit exactly where they were drawn.
 */
export const SHADOW_STRENGTH = 0.85;
export const EDGE_NUDGE_PX = 1;

/** What the engine needs to know about one painted wall. */
export interface WallPaint {
  id: string;
  hex: string;
  /** The shade's light reflectance, when the colour is a catalogue shade. */
  lrv?: number | null;
  /** Drawn by hand (no edge nudge). */
  manual?: boolean;
}

/** 0..1 per channel from "#rrggbb". */
export function hexToRgb01(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
}

/**
 * The colour a wall is painted at. A catalogue shade paints at its MEASURED brightness —
 * the hex's hue with its luminance corrected to the shade's LRV — so a wall reads as light
 * or dark as the real paint; a colour with no LRV paints its hex unchanged.
 */
export function paintTarget(hex: string, lrv?: number | null): [number, number, number] {
  return lrv != null ? lrvCorrectedRgb01(hex, lrv) : hexToRgb01(hex);
}

/** The engine's instructions for each painted wall, in paint order. */
export function regionPaints(
  walls: readonly WallPaint[],
  opts: { baseL: ReadonlyMap<string, number>; cleaned: boolean; strength?: number },
): RegionPaint[] {
  return walls.map((w) => ({
    maskId: w.id,
    target: paintTarget(w.hex, w.lrv),
    preserve: SHADOW_STRENGTH,
    baseL: opts.baseL.get(w.id) ?? 0,
    anchor: opts.cleaned,
    strength: opts.strength,
  }));
}

/**
 * Mean perceptual luminance (0..1) of the photo inside a mask — the wall's "LRV in the
 * photo", the neutral point for following its light. Both copies are the same size; a
 * mask that covers nothing gives 0 (which turns shading off for it). Website
 * webgl-recolor.ts `regionMeanLuma`, on copies read back from the GPU.
 */
export function meanLumaInMask(image: Readback, mask: Readback): number {
  if (image.width !== mask.width || image.height !== mask.height) return 0;
  const src = image.data;
  const msk = mask.data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < src.length; i += 4) {
    if (msk[i]! < 128) continue;
    sum += 0.2126 * src[i]! + 0.7152 * src[i + 1]! + 0.0722 * src[i + 2]!;
    count++;
  }
  return count === 0 ? 0 : sum / count / 255;
}

/**
 * The wall under a point of the photo (u, v in 0..1 from the top left), or null. Walls
 * are painted in order, so the last one covering the point is the one on top; a point a
 * hair outside every wall picks the nearest within `slop` sample pixels, because a
 * finger is wider than a mask's edge.
 */
export function wallAt(
  u: number,
  v: number,
  samples: readonly { id: string; sample: Readback }[],
  slop = 2,
): string | null {
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  for (let ring = 0; ring <= slop; ring++) {
    for (let i = samples.length - 1; i >= 0; i--) {
      const { id, sample } = samples[i]!;
      if (covers(sample, u, v, ring)) return id;
    }
  }
  return null;
}

function covers(s: Readback, u: number, v: number, ring: number): boolean {
  const cx = Math.min(s.width - 1, Math.floor(u * s.width));
  const cy = Math.min(s.height - 1, Math.floor(v * s.height));
  for (let dy = -ring; dy <= ring; dy++) {
    for (let dx = -ring; dx <= ring; dx++) {
      if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
      if (s.data[(y * s.width + x) * 4]! >= 128) return true;
    }
  }
  return false;
}

/** Share of the photo a mask covers, 0..1 — a wall too small to tap gets a chip only. */
export function coverage(sample: Readback): number {
  let on = 0;
  for (let i = 0; i < sample.data.length; i += 4) if (sample.data[i]! >= 128) on++;
  return on / Math.max(1, sample.width * sample.height);
}
