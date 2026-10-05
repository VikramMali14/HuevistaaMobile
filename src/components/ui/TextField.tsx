import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { t } from "@/i18n";
import { fonts, hairline, minTouch, useTheme } from "@/theme";

import { Text } from "./Text";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Help under the field (hidden while there is an error). */
  hint?: string;
  error?: string | null;
  /** A password: hidden as it is typed, with a Show / Hide switch inside the box. */
  revealable?: boolean;
}

/**
 * One-column form field, mapped from the website's `.field` (globals.css):
 * uppercase 12px label in the soft ink; a surface box with a strong hairline and the
 * card radius; the border turns to ink on focus (brass would fall under 3:1 on paper);
 * the error in the terracotta text cut at 13px.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, editable = true, revealable = false, secureTextEntry, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? colors.dangerText : focused ? colors.fg : colors.ruleStrong;
  // A revealable field is a password field: hidden until "Show", whatever the caller passed.
  const hidden = (revealable || Boolean(secureTextEntry)) && !revealed;

  return (
    <View style={styles.wrap}>
      <Text variant="fieldLabel">{label}</Text>
      <View
        style={[
          styles.box,
          { backgroundColor: colors.surface, borderColor, borderRadius: radius.md, opacity: editable ? 1 : 0.55 },
        ]}
      >
        <TextInput
          ref={ref}
          editable={editable}
          secureTextEntry={hidden}
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
          style={[styles.input, { color: colors.fg }]}
          {...rest}
        />
        {revealable ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? `${t("common.hide")} ${label}` : `${t("common.show")} ${label}`}
            hitSlop={6}
            style={styles.reveal}
          >
            <Text variant="small" tone="accent" style={styles.revealText}>
              {revealed ? t("common.hide") : t("common.show")}
            </Text>
          </Pressable>
        ) : null}
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
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 16,
    // The box's border shows focus; in the web preview the browser would add a second ring.
    outlineWidth: 0,
  },
  reveal: { minWidth: minTouch, minHeight: minTouch, paddingHorizontal: 12, justifyContent: "center" },
  revealText: { fontFamily: fonts.semibold },
  error: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
});
