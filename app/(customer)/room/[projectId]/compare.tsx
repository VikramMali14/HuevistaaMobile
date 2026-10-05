import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton, Banner, Button, ErrorState, Screen, Text, useToast } from "@/components/ui";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { fitRect, RoomCanvas, type CanvasState, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import { initRoom, useRoomPaint } from "@/features/studio/paint-store";
import { useColourReader } from "@/features/studio/use-colour-reader";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls } from "@/features/studio/wall-plan";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * C14 · Before and after. Spec: docs/04-screens-customer.md — C14.
 *
 * The room full screen with a divider to drag: the photo as it was on the left, painted
 * on the right — drawn by the engine itself, so Share this view sends exactly this
 * picture (WhatsApp first, wherever the phone's share sheet puts it).
 */
export default function Compare() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, radius, space } = useTheme();
  const { projectId = "" } = useLocalSearchParams<{ projectId: string }>();
  const room = useRoom(projectId);
  const paint = useRoomPaint(projectId);
  const readColour = useColourReader();
  const canvas = useRef<RoomCanvasHandle>(null);
  const [state, setState] = useState<CanvasState>({ kind: "loading" });
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [split, setSplit] = useState(0.5);
  const sharing = useSubmit();

  // Opened straight from a link, the room's colours come from what it was saved with.
  useEffect(() => {
    if (!room.data) return;
    const order = planWalls(wallsWithMasks(room.data)).map((w) => String(w.id));
    initRoom(projectId, room.data, order, readColour);
  }, [room.data, projectId, readColour]);

  const rect = box && state.kind === "ready" ? fitRect(box, state) : null;
  const move = (x: number) => {
    if (rect) setSplit(Math.max(0, Math.min(1, x / rect.width)));
  };

  const share = () =>
    void sharing.run(async () => {
      try {
        const uri = await canvas.current?.snapshot();
        if (!uri || !(await Sharing.isAvailableAsync())) throw new Error("No share sheet");
        await Sharing.shareAsync(uri, { mimeType: "image/jpeg", dialogTitle: t("compare.share") });
      } catch {
        toast.show(t("compare.shareFailed"), "error");
      }
    });

  if (room.isError) {
    return (
      <Screen>
        <BackButton fallback="/studio" />
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      </Screen>
    );
  }
  const data = room.data;
  if (!data) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  const photo = roomPhoto(data);
  const walls = canvasWalls(data, (r) => {
    const c = r.inPlan === false ? null : paint.colours[String(r.id)];
    return { hex: c?.hex ?? null, lrv: c?.lrv };
  });
  const nothingPainted = walls.every((w) => !w.hex);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top, paddingBottom: insets.bottom + space.sm }]}>
      <View style={[styles.top, { paddingHorizontal: space.xs }]}>
        <BackButton fallback="/studio" />
        <Text variant="bodyStrong" style={styles.fill} accessibilityRole="header">
          {t("compare.title")}
        </Text>
      </View>
      <View style={styles.fill} onLayout={(e: LayoutChangeEvent) => setBox(e.nativeEvent.layout)}>
        <RoomCanvas
          ref={canvas}
          photo={photo.load}
          photoKey={photo.key}
          walls={walls}
          cleaned={Boolean(data.cleanedImageUrl)}
          splitAt={split}
          onState={setState}
          testID="compare-canvas"
        />
        {rect ? (
          <View
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => move(e.nativeEvent.locationX)}
            onResponderMove={(e) => move(e.nativeEvent.locationX)}
            style={[styles.overlay, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t("compare.drag")}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(split * 100) }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={(e) =>
              setSplit((s) => Math.max(0, Math.min(1, s + (e.nativeEvent.actionName === "increment" ? 0.1 : -0.1))))
            }
            testID="compare-divider"
          >
            <View pointerEvents="none" style={[styles.line, { left: split * rect.width - 1, backgroundColor: "#ffffff" }]} />
            <View
              pointerEvents="none"
              style={[styles.handle, { left: split * rect.width - 18, top: rect.height / 2 - 18, backgroundColor: "#ffffff" }]}
            />
            <View pointerEvents="none" style={[styles.pill, { left: 8, backgroundColor: `${colors.bg}e6`, borderRadius: radius.pill }]}>
              <Text variant="caption">{t("compare.before")}</Text>
            </View>
            <View pointerEvents="none" style={[styles.pill, { right: 8, backgroundColor: `${colors.bg}e6`, borderRadius: radius.pill }]}>
              <Text variant="caption">{t("compare.after")}</Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.sm, gap: space.xs }}>
        {state.kind === "noGl" ? <Banner tone="warning" message={t("paint.noGl")} /> : null}
        <CanvasTrouble state={state} onRetry={() => canvas.current?.retry()} />
        {state.kind === "ready" && nothingPainted ? (
          <Text variant="small" tone="soft" align="center">
            {t("compare.nothingPainted")}
          </Text>
        ) : null}
        <Button label={t("compare.share")} icon="share-2" onPress={share} loading={sharing.busy} disabled={state.kind !== "ready"} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 4 },
  overlay: { position: "absolute" },
  line: { position: "absolute", top: 0, bottom: 0, width: 2 },
  handle: { position: "absolute", width: 36, height: 36, borderRadius: 18, opacity: 0.95 },
  pill: { position: "absolute", top: 8, paddingHorizontal: 10, paddingVertical: 4 },
});
