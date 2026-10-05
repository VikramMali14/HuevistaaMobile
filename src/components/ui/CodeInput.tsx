import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, TextInput, View } from "react-native";

import { fonts, hairline, useTheme } from "@/theme";

import { Text } from "./Text";
import { useReducedMotion } from "./use-reduced-motion";

export interface CodeInputHandle {
  focus(): void;
  clear(): void;
  /** A small horizontal shake — "that code isn't right". Skipped under Reduce motion. */
  shake(): void;
}

export interface CodeInputProps {
  /** Digits typed so far. */
  value: string;
  onChange: (digits: string) => void;
  /** Called once all boxes are filled. */
  onComplete?: (code: string) => void;
  length?: number;
  label: string;
  error?: string | null;
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

/**
 * The boxes for a texted or emailed code (A4, A7, A8).
 *
 * One real TextInput sits invisibly over the boxes and does all the work, so paste,
 * the keyboard's suggestion strip and SMS autofill (`sms-otp` / `oneTimeCode`) fill every
 * box at once. The boxes only draw what it holds.
 */
export const CodeInput = forwardRef<CodeInputHandle, CodeInputProps>(function CodeInput(
  { value, onChange, onComplete, length = 6, label, error, editable = true, autoFocus = true, testID },
  ref,
) {
  const { colors, radius } = useTheme();
  const reduced = useReducedMotion();
  const input = useRef<TextInput>(null);
  const [offset] = useState(() => new Animated.Value(0));
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    clear: () => onChange(""),
    shake: () => {
      if (reduced) return;
      const step = (to: number) => Animated.timing(offset, { toValue: to, duration: 50, useNativeDriver: true });
      Animated.sequence([step(-8), step(8), step(-6), step(6), step(0)]).start();
    },
  }));

  useEffect(() => {
    if (autoFocus && editable) {
      const id = setTimeout(() => input.current?.focus(), 250);
      return () => clearTimeout(id);
    }
  }, [autoFocus, editable]);

  const change = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  const active = Math.min(value.length, length - 1);

  return (
    <View style={styles.wrap}>
      <Text variant="fieldLabel">{label}</Text>
      <Pressable onPress={() => input.current?.focus()} accessible={false}>
        <Animated.View style={[styles.row, { transform: [{ translateX: offset }] }]}>
          {Array.from({ length }, (_, i) => {
            const isActive = focused && editable && i === active;
            const borderColor = error ? colors.dangerText : isActive ? colors.fg : colors.ruleStrong;
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  {
                    borderColor,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                    opacity: editable ? 1 : 0.55,
                  },
                ]}
              >
                <Text variant="code" style={styles.digit}>
                  {value[i] ?? ""}
                </Text>
              </View>
            );
          })}
        </Animated.View>
        <TextInput
          ref={input}
          testID={testID}
          value={value}
          onChangeText={change}
          editable={editable}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          caretHidden
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.hidden}
        />
      </Pressable>
      {error ? (
        <Text style={styles.error} tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  box: {
    flex: 1,
    maxWidth: 56,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: hairline,
  },
  digit: { fontSize: 24, lineHeight: 30 },
  // Covers the boxes so a tap lands in it, but draws nothing.
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: "transparent", fontSize: 1 },
  error: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
});
