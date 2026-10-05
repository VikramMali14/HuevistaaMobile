import { contrastRatio } from "./color";

/**
 * The status-bar text that reads on `hex` — for a screen whose top is a colour rather
 * than the app's own background (C19's swatch runs up under the clock).
 */
export function barStyleOn(hex: string): "dark" | "light" {
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#ffffff") ? "dark" : "light";
}
