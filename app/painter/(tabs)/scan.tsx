import Feather from "@expo/vector-icons/Feather";
import { CameraView, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, Button, IconButton, QrFrame, Screen, Text } from "@/components/ui";
import { rewardTokenFrom } from "@/features/painter/reward-token";
import { t } from "@/i18n";
import { useCameraPermission } from "@/lib/use-camera-permission";
import { useTheme } from "@/theme";

/**
 * P3 · Scan. Spec: docs/05-screens-painter.md — P3. Web reference:
 * HueVistaaPainter app/(app)/(painter)/scan/scan-screen.tsx, components/app/qr-scanner.tsx.
 *
 * The camera filling the tab with the viewfinder and a torch, and two ways round it: the
 * board's PDF (P7) and typing the code (P8). Every read goes through rewardTokenFrom — a
 * board's QR goes on to P6 with a tap of the hand; anybody else's is said to be so here,
 * without asking the server. The camera reads every frame, so each text is handled once
 * until the screen is come back to; and it runs only while this tab is the one showing
 * (tabs stay mounted), so it never holds the camera from behind another screen.
 */
export default function PainterScan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space } = useTheme();
  const [permission, requestPermission] = useCameraPermission();
  const [focused, setFocused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [notOurs, setNotOurs] = useState(false);
  const [broken, setBroken] = useState(false);
  const delivered = useRef<string | null>(null);
  // A ref, so frames arriving in the same instant see it at once; the state dims the frame.
  const leaving = useRef(false);
  const [handled, setHandled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Back on this tab: whatever was read before may be read again ("Scan another").
      delivered.current = null;
      leaving.current = false;
      setHandled(false);
      setNotOurs(false);
      setFocused(true);
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );

  const onRead = ({ data }: BarcodeScanningResult) => {
    if (leaving.current || !data || data === delivered.current) return;
    delivered.current = data;
    const token = rewardTokenFrom(data);
    if (!token) {
      setNotOurs(true);
      return;
    }
    leaving.current = true;
    setHandled(true);
    setNotOurs(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.push({ pathname: "/painter/claim/[token]", params: { token } });
  };

  const ways = (
    <View style={{ gap: space.xs }}>
      <Button variant="secondary" icon="file-text" label={t("painter.scan.pdf")} onPress={() => router.push("/painter/upload-board")} testID="scan-pdf" />
      <Button variant="secondary" icon="type" label={t("painter.scan.type")} onPress={() => router.push("/painter/type-code")} testID="scan-type" />
    </View>
  );

  if (!permission) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]} testID="scan-starting">
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  if (!permission.granted || broken) {
    const denied = !permission.canAskAgain;
    return (
      <Screen
        scroll
        edges={["top"]}
        contentStyle={{ gap: space.lg }}
        footer={
          <View style={{ gap: space.xs }}>
            {broken ? null : denied ? (
              <Button label={t("painter.scan.openSettings")} onPress={() => void Linking.openSettings()} />
            ) : (
              <Button label={t("painter.scan.allow")} icon="camera" onPress={() => void requestPermission()} testID="scan-allow" />
            )}
            {ways}
          </View>
        }
      >
        <View style={{ gap: space.sm, marginTop: space.xl }} testID="scan-permission">
          <Feather name={broken || denied ? "camera-off" : "camera"} size={40} color={colors.accentText} />
          <Text variant="title1" accessibilityRole="header">
            {broken ? t("painter.scan.askTitle") : denied ? t("painter.scan.deniedTitle") : t("painter.scan.askTitle")}
          </Text>
          <Text variant="painterBody" tone="soft">
            {broken ? t("painter.scan.noCamera") : denied ? t("painter.scan.deniedBody") : t("painter.scan.askBody")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: "#000" }]} testID="scan-camera">
      {focused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onRead}
          onMountError={() => setBroken(true)}
          testID="camera"
        />
      ) : null}
      <View style={[styles.top, { paddingTop: insets.top + space.xs, paddingHorizontal: space.gutter, gap: space.xs }]}>
        <View style={[styles.fill, { gap: 2 }]}>
          <Text variant="title2" accessibilityRole="header" style={styles.onCamera}>
            {t("painter.scan.title")}
          </Text>
          <Text variant="small" style={styles.onCamera}>
            {t("painter.scan.hint")}
          </Text>
        </View>
        <IconButton
          variant="onPhoto"
          icon={torch ? "zap" : "zap-off"}
          label={torch ? t("painter.scan.torchOff") : t("painter.scan.torchOn")}
          onPress={() => setTorch((on) => !on)}
          testID="scan-torch"
        />
      </View>
      <View style={[styles.fill, styles.center]}>
        <QrFrame dim={handled} />
      </View>
      <View style={[styles.bottom, { paddingBottom: space.lg, paddingHorizontal: space.gutter, gap: space.sm }]}>
        {notOurs ? <Banner tone="warning" message={t("painter.scan.notOurs")} testID="scan-not-ours" /> : null}
        {ways}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "flex-start" },
  bottom: {},
  onCamera: { color: "#ffffff", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
});
