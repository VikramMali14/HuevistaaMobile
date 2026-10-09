import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { projectsApi } from "@/api/endpoints/projects";
import { keys } from "@/api/query-keys";
import type { ColourCombo, MatchedShade } from "@/api/types";
import { useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import type { ShadeCodeScheme } from "@/lib/shade-codes";
import type { PaintShade } from "@/lib/shade-types";

import type { WallColour } from "./paint-store";
import { shadeColour } from "./shade-colour";

/** A suggested colour, ready for a wall (and for the Recent row once used). */
export type SuggestedColour = WallColour & { brandSlug?: string };

/** C11: at most this many suggested swatches in the dock. */
export const DOCK_SUGGESTED_MAX = 9;

/**
 * A suggestion's colour as a wall's colour: its catalogue shade when the catalogue has it
 * (so it paints at the real paint's lightness and shows this viewer's code), else the
 * matched shade's own hex and code, else the bare hex.
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

/** A palette's main, accent and trim colours, in that order. */
export function comboColours(combo: ColourCombo, shades: readonly PaintShade[] | undefined, scheme: ShadeCodeScheme): SuggestedColour[] {
  return [
    suggestedColour(combo.primaryShade, combo.primaryHex, shades, scheme),
    suggestedColour(combo.accentShade, combo.accentHex, shades, scheme),
    suggestedColour(combo.trimShade, combo.trimHex, shades, scheme),
  ];
}

/**
 * The dock's suggested swatches: every palette's colours, mains first (they suit a whole
 * wall), each once, leaving out what the Recent row already shows. Only real shades — a
 * colour with no code can't be saved as one.
 */
export function dockSuggestions(
  combos: readonly ColourCombo[],
  shades: readonly PaintShade[] | undefined,
  scheme: ShadeCodeScheme,
  shown: readonly string[] = [],
  max = DOCK_SUGGESTED_MAX,
): (SuggestedColour & { code: string })[] {
  const seen = new Set(shown.map((c) => c.toUpperCase()));
  const trios = combos.map((c) => comboColours(c, shades, scheme));
  const out: (SuggestedColour & { code: string })[] = [];
  for (let slot = 0; slot < 3; slot++) {
    for (const trio of trios) {
      const c = trio[slot];
      if (!c?.code || !c.hex || seen.has(c.code.toUpperCase())) continue;
      seen.add(c.code.toUpperCase());
      out.push(c as SuggestedColour & { code: string });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * C11's suggested swatches for a room: the first set of C13's palettes (the same cached
 * answer C13 opens on), as single colours. Empty while loading, or when there are none.
 */
export function useDockSuggestions(projectId: string, enabled: boolean, shown: readonly string[]) {
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const query = useQuery({
    queryKey: keys.suggestions(projectId, 0),
    queryFn: () => projectsApi.suggestions(projectId, 0),
    enabled: enabled && Boolean(projectId),
    staleTime: Infinity,
  });
  const shades = catalogue.data?.shades;
  const combos = query.data?.combinations;
  const shownKey = shown.join("|");
  return useMemo(
    () => (combos ? dockSuggestions(combos, shades, scheme, shownKey ? shownKey.split("|") : []) : []),
    [combos, shades, scheme, shownKey],
  );
}
