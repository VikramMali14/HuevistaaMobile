import { closenessRating } from "@/lib/color-science";
import { samplePatch } from "@/lib/surface-sample";
import { t } from "@/i18n";

import type { FinderPhoto } from "./photo-pixels";

/** A spot on the photo's pixels. */
export interface Spot {
  x: number;
  y: number;
}

/** What a tap read: the surface's colour, and how much of one colour the spot was (0–1). */
export interface Reading {
  hex: string;
  uniformity: number;
}

/**
 * The pixel a tap landed on: where the finger was on the photo as shown, scaled to the photo
 * as read. Null for a tap outside it.
 */
export function spotAt(
  locationX: number,
  locationY: number,
  shown: { width: number; height: number },
  read: { width: number; height: number },
): Spot | null {
  if (shown.width <= 0 || shown.height <= 0) return null;
  const x = Math.floor((locationX / shown.width) * read.width);
  const y = Math.floor((locationY / shown.height) * read.height);
  if (x < 0 || y < 0 || x >= read.width || y >= read.height) return null;
  return { x, y };
}

/**
 * The colour of the SURFACE at a spot — a piece of wall, not a pixel — off the photo as taken
 * or with its lighting evened out: the website's reading (samplePatch), so a wall reads the same
 * on both.
 */
export function readAt(photo: FinderPhoto, spot: Spot, evenLight: boolean): Reading | null {
  const { width, height, data } = photo.pixels;
  const sample = samplePatch(evenLight ? photo.even : data, width, height, spot.x, spot.y);
  return sample ? { hex: sample.hex, uniformity: sample.uniformity } : null;
}

/** How close a shade is, in words — the counter's three, in the app's language. */
export function closenessWords(deltaE: number): string {
  const rating = closenessRating(deltaE);
  return rating === "Very close"
    ? t("colourFinder.veryClose")
    : rating === "Close"
      ? t("colourFinder.close")
      : t("colourFinder.notExact");
}
