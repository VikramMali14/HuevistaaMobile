import { StyleSheet, View } from "react-native";

import { useTheme } from "@/theme";

/**
 * The scanner's viewfinder (docs/02 `QrFrame`): four brass corners marking where the QR
 * goes, over a camera. Drawn, not pressed — it lets touches through to the camera, and is
 * hidden from a screen reader (the screen says what to do in words). `dim` while a read is
 * being handled, so it is plain nothing more is being looked for.
 */
export function QrFrame({ dim = false, size = 240 }: { dim?: boolean; size?: number }) {
  const { colors } = useTheme();
  const corner = { borderColor: colors.accentSoft, width: 40, height: 40 };
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size, opacity: dim ? 0.3 : 1 }]}
      testID="qr-frame"
    >
      <View style={[styles.corner, corner, styles.topLeft]} />
      <View style={[styles.corner, corner, styles.topRight]} />
      <View style={[styles.corner, corner, styles.bottomLeft]} />
      <View style={[styles.corner, corner, styles.bottomRight]} />
    </View>
  );
}

const W = 4;
const styles = StyleSheet.create({
  frame: { alignSelf: "center" },
  corner: { position: "absolute" },
  topLeft: { top: 0, left: 0, borderTopWidth: W, borderLeftWidth: W, borderTopLeftRadius: 14 },
  topRight: { top: 0, right: 0, borderTopWidth: W, borderRightWidth: W, borderTopRightRadius: 14 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: W, borderLeftWidth: W, borderBottomLeftRadius: 14 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: W, borderRightWidth: W, borderBottomRightRadius: 14 },
});
