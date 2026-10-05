import { displayCodeOf, type ShadeCodeScheme } from "@/lib/shade-codes";
import type { PaintShade } from "@/lib/shade-types";

import type { WallColour } from "./paint-store";

/**
 * A catalogue shade as a wall's colour: its hex, the code this viewer is shown (the HV
 * code, for a customer — the backend maps it back when saving), and its LRV so it paints
 * at the real paint's lightness. An LRV of 0 is "not known".
 */
export function shadeColour(shade: PaintShade, scheme: ShadeCodeScheme): WallColour {
  return { hex: shade.hex, code: displayCodeOf(scheme, shade), lrv: shade.lrv > 0 ? shade.lrv : null };
}
