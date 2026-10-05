import type { RegionCategory, RoomRegion } from "@/api/types";
import { nearestShade } from "@/lib/color";
import type { ShadeCodeScheme } from "@/lib/shade-codes";
import type { PaintShade } from "@/lib/shade-types";

import type { WallColour } from "./paint-store";
import { shadeColour } from "./shade-colour";

/**
 * The colours the backend opens a found wall with ("colour on create",
 * SegmentationService#defaultHexFor): an exterior's body, feature and trim reference
 * shades; indoors everything opens white. Website visualizer.tsx DEFAULT_HEX_FOR_KIND.
 */
const OPENING_HEX: Record<RegionCategory, string> = {
  MAIN_WALL: "#e8d5b0",
  ACCENT_WALL: "#b0603e",
  OTHER_WALL: "#e8d5b0",
  TRIM: "#4a362a",
  CEILING: "#ffffff",
  MANUAL: "#ffffff",
};

/** The company a room's opening colours are taken from (website visualizer.tsx). */
export const OPENING_BRAND = "Asian Paints";

/** The opening company: Asian Paints when this account can see it, else the one with the most shades. */
export function pickOpeningBrand(catalogue: readonly PaintShade[]): string | undefined {
  if (catalogue.some((s) => s.brand === OPENING_BRAND)) return OPENING_BRAND;
  const counts = new Map<string, number>();
  for (const s of catalogue) counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
  let best: string | undefined;
  let bestN = 0;
  for (const [brand, n] of counts) {
    if (n > bestN) {
      best = brand;
      bestN = n;
    }
  }
  return best;
}

type SavedRegion = Pick<RoomRegion, "category" | "appliedHexCode" | "appliedShadeCode" | "appliedHvCode">;

/**
 * A wall's saved colour as the studio paints it (website visualizer.tsx
 * `mapBackendRegion`). The saved row keeps only a code and a hex, so the catalogue shade
 * is found again — by the code, else by the exact hex — to paint at its measured LRV. A
 * found wall still on the backend's opening reference colour (no code saved) is snapped
 * to the nearest shade of the opening company, so every opening colour is a real shade;
 * it is worked out the same way every time, so nothing needs saving. Null: not painted.
 */
export function savedColour(
  region: SavedRegion,
  catalogue: readonly PaintShade[],
  scheme: ShadeCodeScheme,
  openingBrand: string | undefined = pickOpeningBrand(catalogue),
): WallColour | null {
  const savedCode = region.appliedHvCode || region.appliedShadeCode || null;
  if (!region.appliedHexCode && !savedCode) return null;
  const hex = region.appliedHexCode || OPENING_HEX[region.category];
  const byCode = savedCode ? catalogue.find((s) => s.code === savedCode || s.hvCode === savedCode) : undefined;
  const shade = byCode ?? catalogue.find((s) => s.hex.toLowerCase() === hex.toLowerCase());

  const opening = region.category !== "MANUAL" && !savedCode && hex.toLowerCase() === OPENING_HEX[region.category];
  if (opening && openingBrand) {
    const snapped = nearestShade(
      hex,
      catalogue.filter((s) => s.brand === openingBrand),
    );
    if (snapped) return shadeColour(snapped, scheme);
  }
  if (!shade) return { hex, code: savedCode, lrv: null };
  const own = shadeColour(shade, scheme);
  return { hex, code: savedCode ?? own.code, lrv: own.lrv };
}
