import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { fonts, hairline, useTheme } from "@/theme";

import { Text } from "./Text";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Help under the field (hidden while there is an error). */
  hint?: string;
  error?: string | null;
}

/**
 * One-column form field, mapped from the website's `.field` (globals.css):
 * uppercase 12px label in the soft ink; a surface box with a strong hairline and the
 * card radius; the border turns to ink on focus (brass would fall under 3:1 on paper);
 * the error in the terracotta text cut at 13px.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, editable = true, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.dangerText : focused ? colors.fg : colors.ruleStrong;

  return (
    <View style={styles.wrap}>
      <Text variant="fieldLabel" tone="soft">
        {label}
      </Text>
      <TextInput
        ref={ref}
        editable={editable}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
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
        style={[
          styles.input,
          {
            color: colors.fg,
            backgroundColor: colors.surface,
            borderColor,
            borderRadius: radius.md,
            opacity: editable ? 1 : 0.55,
          },
        ]}
        {...rest}
      />
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
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 16,
    borderWidth: hairline,
  },
  error: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
});
