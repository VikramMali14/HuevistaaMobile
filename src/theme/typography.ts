import type { TextStyle } from "react-native";

/** Font family names as registered by useFonts() in app/_layout.tsx. */
export const fonts = {
  regular: "Inter_400Regular",
  semibold: "Inter_600SemiBold",
  /** Instrument Serif italic — the one emphasised word in a display heading, nothing else. */
  emphasis: "InstrumentSerif_400Regular_Italic",
} as const;

export type TextVariant =
  | "display"
  | "title1"
  | "title2"
  | "title3"
  | "body"
  | "bodyStrong"
  | "small"
  | "caption"
  | "label"
  | "code";

/**
 * The type scale from docs/02-design-system.md. Colour is applied by <Text>, not here,
 * so the same scale serves both themes.
 */
export const typeScale: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 38, letterSpacing: -0.7 },
  title1: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  title2: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  title3: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  // The label treatment (uppercase + tracking) is what makes a label — never use it for
  // a shade code, which must stay in natural case so its digits are unmistakable.
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  code: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, fontVariant: ["tabular-nums"] },
};
