import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { fonts, useTheme } from "@/theme";

import { Text } from "./Text";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Help under the field (hidden while there is an error). */
  hint?: string;
  error?: string | null;
}

/** One-column form field: label above, hint or error below. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, editable = true, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.dangerText : focused ? colors.accent : colors.ruleStrong;

  return (
    <View style={styles.wrap}>
      <Text variant="small" tone="soft">
        {label}
      </Text>
      <TextInput
        ref={ref}
        editable={editable}
        accessibilityLabel={label}
        placeholderTextColor={colors.fgMute}
        selectionColor={colors.accent}
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
            backgroundColor: colors.surfaceSoft,
            borderColor,
            borderRadius: radius.sm,
            opacity: editable ? 1 : 0.5,
          },
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
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
  wrap: { gap: 6 },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    borderWidth: 1,
  },
});
