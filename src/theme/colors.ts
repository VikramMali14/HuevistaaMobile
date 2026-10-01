/**
 * Ink, paper and brass — the website's palette, value for value
 * (HueVistaFrontEnd/src/app/globals.css: `:root` for dark, `html[data-theme="light"]`
 * for light). See docs/02-design-system.md for why each value is what it is.
 *
 * The one rule: the only saturated colour on a screen is the paint. Nothing here may
 * become a vivid hue. If a value changes on the website, change it here too —
 * src/theme/__tests__/colors.test.ts pins the pairings that must stay readable.
 */
export interface Palette {
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceSoft: string;
  fg: string;
  fgSoft: string;
  fgMute: string;
  /** Placeholders in inputs (website --fg-mute-deep). */
  fgMuteDeep: string;
  /** Brass as a FILL — buttons, active states. Never as text on light. */
  accent: string;
  /** The ink that sits ON a brass fill. Never white: brass is a light surface. */
  accentOn: string;
  /** Brass AS TEXT. Lifted on dark, deepened on light (brass itself fails as text on paper). */
  accentText: string;
  /** The lifted cut of brass (website --accent-soft). */
  accentSoft: string;
  /** The deep cut of brass (website --accent-deep). Not a pressed-button fill: ink on it fails. */
  accentDeep: string;
  /** The brand mark (website --hv-mark): the soft cut on dark, the deep cut on paper. */
  mark: string;
  warmText: string;
  /** Warm secondary as a fill — the destructive button (website .btn-warm). White text. */
  warmFill: string;
  /** Errors and destructive marks, as a fill (website --terracotta). */
  danger: string;
  dangerText: string;
  /** Success as a fill (website --sage). Ivory text. */
  success: string;
  successText: string;
  /** The text that sits on a danger or success fill (website --ivory). */
  ivory: string;
  rule: string;
  ruleStrong: string;
  ruleBrass: string;
}

export const dark: Palette = {
  bg: "#100e0c",
  bgDeep: "#0a0908",
  surface: "#191612",
  surfaceSoft: "#221e19",
  fg: "#ece8e1",
  fgSoft: "#c4bdb2",
  fgMute: "#8e867a",
  fgMuteDeep: "#8a8175",
  accent: "#c08b4e",
  accentOn: "#17130e",
  accentText: "#d0a165",
  accentSoft: "#d6a66e",
  accentDeep: "#9a6a33",
  mark: "#d6a66e",
  warmText: "#d9705a",
  warmFill: "#8a3a2e",
  danger: "#c2402a",
  dangerText: "#d9705a",
  success: "#4e7a52",
  successText: "#6fae76",
  ivory: "#f7f6f2",
  rule: "rgba(236,232,225,.08)",
  ruleStrong: "rgba(236,232,225,.16)",
  ruleBrass: "rgba(192,139,78,.35)",
};

export const light: Palette = {
  bg: "#f6f3ec",
  bgDeep: "#ece8df",
  surface: "#ffffff",
  surfaceSoft: "#f0ece2",
  fg: "#191612",
  fgSoft: "#433e37",
  fgMute: "#6d6659",
  fgMuteDeep: "#6b6457",
  accent: "#c08b4e",
  accentOn: "#17130e",
  accentText: "#8a5f28",
  accentSoft: "#d6a66e",
  accentDeep: "#8a5f28",
  mark: "#8a5f28",
  warmText: "#9c3f2c",
  warmFill: "#8a3a2e",
  danger: "#a83b22",
  dangerText: "#a83b22",
  success: "#3f6a45",
  successText: "#3f6a45",
  ivory: "#f7f6f2",
  rule: "rgba(25,22,18,.16)",
  ruleStrong: "rgba(25,22,18,.28)",
  ruleBrass: "rgba(192,139,78,.42)",
};
