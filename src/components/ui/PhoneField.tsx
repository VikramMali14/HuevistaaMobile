import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { formatMobileForDisplay, mobileDigits } from "@/lib/validation";
import { fonts, hairline, useTheme } from "@/theme";

import { Text } from "./Text";

export interface PhoneFieldProps
  extends Omit<TextInputProps, "style" | "value" | "onChangeText" | "keyboardType"> {
  label: string;
  /** The ten digits, without +91. */
  value: string;
  onChangeDigits: (digits: string) => void;
  hint?: string;
  error?: string | null;
}

/**
 * An Indian mobile number: a fixed +91 in front, the number pad, and the digits grouped
 * 5-5 the way they are read aloud ("98765 43210"). Styled exactly like TextField.
 */
/**
 * The digits after an edit. Deleting the space between the two groups would leave the
 * digits unchanged — the field would seem to ignore the key — so that deletes the digit
 * before the space instead.
 */
export function nextDigits(text: string, previous: string): string {
  const digits = mobileDigits(text).slice(0, 10);
  const deletedTheSpace = digits === previous && text.length < formatMobileForDisplay(previous).length;
  return deletedTheSpace ? previous.slice(0, 4) + previous.slice(5) : digits;
}

export const PhoneField = forwardRef<TextInput, PhoneFieldProps>(function PhoneField(
  { label, value, onChangeDigits, hint, error, editable = true, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.dangerText : focused ? colors.fg : colors.ruleStrong;

  return (
    <View style={styles.wrap}>
      <Text variant="fieldLabel">{label}</Text>
      <View
        style={[
          styles.box,
          { backgroundColor: colors.surface, borderColor, borderRadius: radius.md, opacity: editable ? 1 : 0.55 },
        ]}
      >
        <Text style={styles.prefix} tone="soft" accessibilityElementsHidden importantForAccessibility="no">
          +91
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.ruleStrong }]} />
        <TextInput
          ref={ref}
          value={formatMobileForDisplay(value)}
          onChangeText={(text) => onChangeDigits(nextDigits(text, value))}
          // The number pad, not the phone pad: +91 is fixed, so only digits are needed.
          // No maxLength — it would cut a pasted "+91 98765 43210" before it is cleaned;
          // mobileDigits() drops the prefix and the slice keeps ten digits.
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          editable={editable}
          accessibilityLabel={`${label}, plus 91`}
          accessibilityHint={error ?? hint}
          placeholder="98765 43210"
          placeholderTextColor={colors.fgMuteDeep}
          selectionColor={colors.accent}
          cursorColor={colors.fg}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: colors.fg }]}
          {...rest}
        />
      </View>
      {error ? (
        <Text style={styles.error} tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="mute">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  box: { minHeight: 52, flexDirection: "row", alignItems: "center", borderWidth: hairline },
  prefix: { fontFamily: fonts.semibold, fontSize: 16, paddingLeft: 14, paddingRight: 10 },
  divider: { width: hairline, alignSelf: "stretch", marginVertical: 12 },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
    // The box's border shows focus; in the web preview the browser would add a second ring.
    outlineWidth: 0,
  },
  error: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
});
