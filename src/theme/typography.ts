import type { TextStyle } from "react-native";

/**
 * Font family names as registered by useFonts() in app/_layout.tsx. The website renders
 * Inter everywhere (its `.hv-glasswork` block re-points the serif and mono tokens at
 * Inter), in four weights, plus Instrument Serif italic for emphasis.
 */
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  /** Instrument Serif italic — the one emphasised word in a display heading, nothing else. */
  emphasis: "InstrumentSerif_400Regular_Italic",
} as const;

export type TextVariant =
  | "display"
  | "title1"
  | "title2"
  | "title3"
  | "lead"
  | "body"
  | "bodyStrong"
  | "small"
  | "caption"
  | "label"
  | "fieldLabel"
  | "code";

/** Tracking in em, as the website writes it, turned into the points React Native wants. */
const em = (size: number, value: number) => Math.round(size * value * 100) / 100;

/**
 * The type scale, mapped from the website's tokens at phone width (globals.css):
 *
 *   display ← --t-band     34px, --tt-band    -.026em, `.display` weight 700
 *   title1  ← --t-section  28px, --tt-section -.020em, `.display` weight 700
 *   title2  ← --t-card     23px, --tt-card    -.015em
 *   title3  ← --t-panel    19px, --tt-panel   -.008em
 *   lead    ← --t-lead     17px
 *   body    ← --t-body     16px
 *   small   ← --t-sm       14px
 *   caption ← --t-xs       12.5px
 *   label   ← .eyebrow     11.5px / 600 / .14em / uppercase
 *   fieldLabel ← .field-label 12px / 600 / .06em / uppercase
 *
 * Line heights are a little looser than the website's display leading (.94–1.15):
 * Android clips Inter's ascenders and descenders when line-height is close to the font
 * size, and a clipped heading is a broken screen.
 *
 * Colour is applied by <Text>, not here, so the same scale serves both themes.
 */
export const typeScale: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 39, letterSpacing: em(34, -0.026) },
  title1: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 33, letterSpacing: em(28, -0.02) },
  title2: { fontFamily: fonts.semibold, fontSize: 23, lineHeight: 28, letterSpacing: em(23, -0.015) },
  title3: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 25, letterSpacing: em(19, -0.008) },
  lead: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  // The label treatment (uppercase + tracking) is what makes a label — never use it for
  // a shade code, which must stay in natural case so its digits are unmistakable.
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: em(11.5, 0.14),
    textTransform: "uppercase",
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: em(12, 0.06),
    textTransform: "uppercase",
  },
  // Shade codes only: tabular figures, natural case, the website's .02em.
  code: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: em(20, 0.02),
    fontVariant: ["tabular-nums"],
  },
};
