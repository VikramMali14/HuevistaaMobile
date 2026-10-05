import { useEffect, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/i18n";
import { hairline, motion, useTheme } from "@/theme";

import { Text } from "./Text";
import { useReducedMotion } from "./use-reduced-motion";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}

/**
 * A bottom sheet: the page dims, the panel rises with a grabber. Tapping outside or the
 * phone's back button closes it. Tall content scrolls inside, up to 85% of the screen.
 */
export function Sheet({ visible, onClose, title, children, testID }: SheetProps) {
  const { colors, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: reduced ? 0 : motion.normal, useNativeDriver: true }).start();
  }, [visible, reduced, shown]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.fill} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,.5)", opacity: shown }]}>
          <Pressable
            style={styles.fill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.ruleStrong,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingBottom: insets.bottom + space.md,
              transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.ruleStrong }]} />
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.sm, gap: space.md }}
          >
            {title ? (
              <Text variant="title2" accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "85%",
    borderWidth: hairline,
    borderBottomWidth: 0,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginTop: 10 },
});
