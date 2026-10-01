/**
 * Ink, paper and brass — the website's palette (HueVistaFrontEnd/src/app/globals.css),
 * carried to the phone. See docs/02-design-system.md for why each value is what it is.
 *
 * The one rule: the only saturated colour on a screen is the paint. Nothing here may
 * become a vivid hue.
 */
export interface Palette {
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceSoft: string;
  fg: string;
  fgSoft: string;
  fgMute: string;
  /** Brass as a FILL — buttons, active states. */
  accent: string;
  /** The ink that sits ON a brass fill. Never white: brass is a light surface. */
  accentOn: string;
  /** Brass AS TEXT. Lifted on dark, deepened on light (brass itself fails as text on paper). */
  accentText: string;
  /** The brand mark. */
  accentSoft: string;
  accentDeep: string;
  warmText: string;
  warmFill: string;
  danger: string;
  dangerText: string;
  success: string;
  successText: string;
  rule: string;
  ruleStrong: string;
  ruleBrass: string;
}

const brass = {
  accent: "#c08b4e",
  accentOn: "#17130e",
  accentDeep: "#9a6a33",
  warmFill: "#8a3a2e",
  ruleBrass: "rgba(192,139,78,.35)",
} as const;

export const dark: Palette = {
  ...brass,
  bg: "#100e0c",
  bgDeep: "#0a0908",
  surface: "#191612",
  surfaceSoft: "#221e19",
  fg: "#ece8e1",
  fgSoft: "#c4bdb2",
  fgMute: "#8e867a",
  accentText: "#d0a165",
  accentSoft: "#d6a66e",
  warmText: "#d9705a",
  danger: "#c2402a",
  dangerText: "#d9705a",
  success: "#4e7a52",
  successText: "#6fae76",
  rule: "rgba(236,232,225,.08)",
  ruleStrong: "rgba(236,232,225,.16)",
};

export const light: Palette = {
  ...brass,
  bg: "#f6f3ec",
  bgDeep: "#ece8df",
  surface: "#ffffff",
  surfaceSoft: "#f0ece2",
  fg: "#191612",
  fgSoft: "#433e37",
  fgMute: "#6d6659",
  accentText: "#8a5f28",
  accentSoft: "#c08b4e",
  warmText: "#9c3f2c",
  danger: "#a83b22",
  dangerText: "#a83b22",
  success: "#3f6a45",
  successText: "#3f6a45",
  rule: "rgba(25,22,18,.16)",
  ruleStrong: "rgba(25,22,18,.28)",
};
