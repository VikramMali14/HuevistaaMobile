import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

export interface ScreenProps {
  children: ReactNode;
  /** Scroll the content (forms, long pages). Lists should use their own list instead. */
  scroll?: boolean;
  /** Keep the default side gutter. Turn off for full-bleed screens (camera, canvas). */
  padded?: boolean;
  /** Content pinned to the bottom, above the home indicator — the primary action lives here. */
  footer?: ReactNode;
  /** Which edges get safe-area padding. Tabs handle the bottom themselves. */
  edges?: Edge[];
  /** The deep ground behind the studio canvas instead of the page colour. */
  deep?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/** The page: warm background, safe areas, optional scroll, keyboard avoidance. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  footer,
  edges = ["top", "bottom"],
  deep = false,
  contentStyle,
}: ScreenProps) {
  const { colors, space } = useTheme();
  const gutter = padded ? { paddingHorizontal: space.gutter } : null;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, gutter, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, gutter, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.fill, { backgroundColor: deep ? colors.bgDeep : colors.bg }]}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {body}
        {footer ? (
          <View style={[styles.footer, { paddingHorizontal: space.gutter, borderTopColor: colors.rule }]}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  footer: { paddingTop: 12, paddingBottom: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
