import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { fonts, useTheme, type Palette, type TextVariant } from "@/theme";

export type TextTone = "default" | "soft" | "mute" | "accent" | "warm" | "danger" | "success" | "onAccent";

const toneColor: Record<TextTone, keyof Palette> = {
  default: "fg",
  soft: "fgSoft",
  mute: "fgMute",
  accent: "accentText",
  warm: "warmText",
  danger: "dangerText",
  success: "successText",
  onAccent: "accentOn",
};

/**
 * Each role's colour when none is given, as on the website: `.lead` and `.field-label`
 * in the soft ink, `.eyebrow` (our `label`) in the muted ink.
 */
const defaultTone: Partial<Record<TextVariant, TextTone>> = {
  lead: "soft",
  fieldLabel: "soft",
  label: "mute",
};

/** Small, dense text breaks layouts first; cap how far the phone's font setting can grow it. */
const maxScale: Partial<Record<TextVariant, number>> = { label: 1.4, caption: 1.4, code: 1.6 };

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: "left" | "center" | "right";
}

/** Every piece of text in the app. Picks the type role and a theme-aware colour. */
export function Text({ variant = "body", tone, align, style, ...rest }: TextProps) {
  const { colors, type } = useTheme();
  const ink = colors[toneColor[tone ?? defaultTone[variant] ?? "default"]];
  return (
    <RNText
      maxFontSizeMultiplier={maxScale[variant]}
      {...rest}
      style={[type[variant], { color: ink }, align && { textAlign: align }, style]}
    />
  );
}

/**
 * The one emphasised word inside a display heading, exactly as the website's
 * `.display i`: Instrument Serif italic at 1.06× (an optical correction — the serif sets
 * smaller), normal tracking, in the soft ink. Never for running text.
 *
 *   <Text variant="display">Keep your <Em variant="display">colours</Em>.</Text>
 */
export function Em({ variant = "display", style, ...rest }: TextProps) {
  const { colors, type } = useTheme();
  const size = type[variant].fontSize ?? 16;
  return (
    <RNText
      {...rest}
      style={[
        { fontFamily: fonts.emphasis, fontSize: size * 1.06, letterSpacing: 0, color: colors.fgSoft },
        style,
      ]}
    />
  );
}
