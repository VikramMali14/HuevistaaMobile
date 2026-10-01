import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { hairline, useTheme } from "@/theme";

import { OfflineBanner } from "./OfflineBanner";

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
  /**
   * X1: show the slim "you're offline" bar at the top of the page while there is no
   * connection. It sits IN the page and pushes the content down, so it never hides a
   * back button. Turn off only for full-bleed canvas screens that show their own.
   */
  offlineBanner?: boolean;
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
  offlineBanner = true,
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
      {/* Android draws edge-to-edge (Expo SDK 54+), so the window no longer resizes for
          the keyboard by itself — both platforms need the padding behaviour. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        {offlineBanner ? <OfflineBanner /> : null}
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
  footer: { paddingTop: 12, paddingBottom: 8, gap: 8, borderTopWidth: hairline },
});
