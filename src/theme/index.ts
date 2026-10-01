import { useColorScheme } from "react-native";

import { dark, light, type Palette } from "./colors";
import { fonts, typeScale } from "./typography";

export { dark, light, fonts, typeScale };
export type { Palette };
export type { TextVariant } from "./typography";

/** Spacing scale in dp. Screen gutter is `space.gutter`. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
  gutter: 20,
} as const;

/** Radius is chosen by what the element IS, not by how round it should look. */
export const radius = {
  /** a tag, a code pill, a swatch corner */
  xs: 6,
  /** an input, a small button, a thumbnail */
  sm: 10,
  /** a card, a panel, a plate — the default */
  md: 16,
  /** a full-bleed surface, a sheet's top corners */
  lg: 22,
  pill: 999,
} as const;

export const motion = {
  /** cubic-bezier(.2,.7,.2,1) */
  easing: [0.2, 0.7, 0.2, 1] as const,
  fast: 160,
  normal: 200,
  slow: 240,
} as const;

/** Minimum touch target, whatever the visible size. */
export const minTouch = 48;

export interface Theme {
  scheme: "light" | "dark";
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  type: typeof typeScale;
}

/**
 * The app follows the phone's light/dark setting, like the website. Dark is the
 * default when the phone does not say.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  return {
    scheme,
    colors: scheme === "light" ? light : dark,
    space,
    radius,
    type: typeScale,
  };
}
