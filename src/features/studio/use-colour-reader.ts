import { useMemo } from "react";

import { useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";

import type { ColourReader } from "./paint-store";
import { pickOpeningBrand, savedColour } from "./saved-colours";

/**
 * How this account's studio reads a wall's saved colour: its catalogue shade found again
 * (for the LRV), and the opening colours snapped to real shades — see saved-colours.ts.
 * Undefined until the catalogue is there; the paint store then reads colours as stored.
 */
export function useColourReader(): ColourReader | undefined {
  const shades = useCatalogue().data?.shades;
  const scheme = useShadeScheme();
  return useMemo(() => {
    if (!shades?.length) return undefined;
    const opening = pickOpeningBrand(shades);
    return (region) => savedColour(region, shades, scheme, opening);
  }, [shades, scheme]);
}
