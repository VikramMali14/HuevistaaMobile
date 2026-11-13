import { useMemo } from "react";

import type { ColourCombo, MatchedShade, ShadeBookPage, ShadeBookShade } from "@/api/types";
import { useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import type { ShadeCodeScheme } from "@/lib/shade-codes";
import type { PaintShade } from "@/lib/shade-types";

import type { WallColour } from "./paint-store";
import { shadeColour } from "./shade-colour";

/**
 * A suggested colour — from a Vista AI palette or a Colour Combination Book combination — ready for a wall
 * (and for the Recent row once used).
 */
export type SuggestedColour = WallColour & { brandSlug?: string };

/**
 * A Vista AI palette's colour as a wall's colour: its catalogue shade when the catalogue has it
 * (so it paints at the real paint's lightness and shows this viewer's code), else the matched
 * shade's own hex and code, else the bare hex.
 */
export function suggestedColour(
  matched: MatchedShade | null | undefined,
  hex: string,
  shades: readonly PaintShade[] | undefined,
  scheme: ShadeCodeScheme,
): SuggestedColour {
  const shade = matched ? shades?.find((s) => s.code === matched.shadeCode || (matched.hvCode && s.hvCode === matched.hvCode)) : undefined;
  if (shade) return { ...shadeColour(shade, scheme), brandSlug: shade.brandSlug };
  return { hex: matched?.hexCode ?? hex, code: matched?.hvCode ?? matched?.shadeCode ?? null, lrv: null };
}

/** A Vista AI palette's main, accent and trim colours, in that order. */
export function comboColours(combo: ColourCombo, shades: readonly PaintShade[] | undefined, scheme: ShadeCodeScheme): SuggestedColour[] {
  return [
    suggestedColour(combo.primaryShade, combo.primaryHex, shades, scheme),
    suggestedColour(combo.accentShade, combo.accentHex, shades, scheme),
    suggestedColour(combo.trimShade, combo.trimHex, shades, scheme),
  ];
}

/** C11: at most this many Colour Combination Book swatches in the dock. */
export const DOCK_SUGGESTED_MAX = 9;

/** Where a room's photo is: anything not known to be outside is a room inside. */
export function scopeOf(imageType: string | null | undefined): "INTERIOR" | "EXTERIOR" {
  return imageType === "OUTDOOR" || imageType === "EXTERIOR" ? "EXTERIOR" : "INTERIOR";
}

/**
 * A Colour Combination Book colour as a wall's colour: its catalogue shade when the catalogue has it (so it
 * paints at the real paint's lightness and shows this viewer's code), else the page's own hex
 * and code.
 */
export function bookColour(
  shade: ShadeBookShade,
  shades: readonly PaintShade[] | undefined,
  scheme: ShadeCodeScheme,
): SuggestedColour {
  const known = shades?.find(
    (s) => (shade.shadeCode && s.code === shade.shadeCode) || (shade.hvCode && s.hvCode === shade.hvCode),
  );
  if (known) return { ...shadeColour(known, scheme), brandSlug: known.brandSlug };
  return { hex: shade.hexCode, code: shade.hvCode ?? shade.shadeCode ?? null, lrv: null };
}

/** A page's colours, in the order of its parts — the main walls first. */
export function pageColours(page: ShadeBookPage, shades: readonly PaintShade[] | undefined, scheme: ShadeCodeScheme): SuggestedColour[] {
  return page.shades.map((part) => bookColour(part.shade, shades, scheme));
}

/**
 * The dock's Colour Combination Book swatches: every combination's colours, first colours first (they suit
 * a whole wall), each once, leaving out what the Recent row already shows. Only real shades —
 * a colour with no code can't be saved as one.
 */
export function dockSuggestions(
  pages: readonly ShadeBookPage[],
  shades: readonly PaintShade[] | undefined,
  scheme: ShadeCodeScheme,
  shown: readonly string[] = [],
  max = DOCK_SUGGESTED_MAX,
): (SuggestedColour & { code: string })[] {
  const seen = new Set(shown.map((c) => c.toUpperCase()));
  const sets = pages.map((p) => pageColours(p, shades, scheme));
  const longest = sets.reduce((n, s) => Math.max(n, s.length), 0);
  const out: (SuggestedColour & { code: string })[] = [];
  for (let slot = 0; slot < longest; slot++) {
    for (const set of sets) {
      const c = set[slot];
      if (!c?.code || !c.hex || seen.has(c.code.toUpperCase())) continue;
      seen.add(c.code.toUpperCase());
      out.push(c as SuggestedColour & { code: string });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * C11's suggested swatches for a room: the Colour Combination Book's combinations of the room's kind
 * (inside or outside), as single colours. Empty while loading, or when there are none.
 */
export function useDockSuggestions(scope: "INTERIOR" | "EXTERIOR", enabled: boolean, shown: readonly string[]) {
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const book = useShadeBook();
  const shades = catalogue.data?.shades;
  const pages = book.data?.combinations;
  const shownKey = shown.join("|");
  return useMemo(
    () =>
      enabled && pages
        ? dockSuggestions(
            pages.filter((p) => p.scope === scope),
            shades,
            scheme,
            shownKey ? shownKey.split("|") : [],
          )
        : [],
    [enabled, pages, scope, shades, scheme, shownKey],
  );
}
