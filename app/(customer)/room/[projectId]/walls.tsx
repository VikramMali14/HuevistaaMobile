import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { projectsApi } from "@/api/endpoints/projects";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { RoomDetail, RoomRegion } from "@/api/types";
import { BackButton, Banner, Button, ErrorState, Screen, StepDots, Text, useToast } from "@/components/ui";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { RoomCanvas, type CanvasState, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { reportLine, WALL_TINTS, wallLabel } from "@/features/studio/wall-plan";
import { t } from "@/i18n";
import { hairline, useTheme } from "@/theme";

/**
 * C9 · Walls found (step 3). Spec: docs/04-screens-customer.md — C9.
 *
 * The cleaned photo with each wall tinted, and the list of walls with "Paint this" on or
 * off — the paint plan. A wall left out keeps its shape and colour; it is just not one of
 * the surfaces being painted. Then Start painting, Fix a wall, or report the walls.
 */
export default function WallsFound() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, radius, space } = useTheme();
  const params = useLocalSearchParams<{ projectId: string; shade?: string; brand?: string }>();
  const id = params.projectId ?? "";
  const room = useRoom(id);
  const report = useQuery({ queryKey: keys.roomReport(id), queryFn: () => projectsApi.latestReport(id), enabled: Boolean(id) });
  const [selected, setSelected] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<CanvasState>({ kind: "loading" });
  const canvasRef = useRef<RoomCanvasHandle>(null);

  const data = room.data;
  const walls = useMemo(() => (data ? wallsWithMasks(data) : []), [data]);
  const tintOf = useMemo(() => new Map(walls.map((w, i) => [w.id, WALL_TINTS[i % WALL_TINTS.length]!])), [walls]);
  const inPlan = walls.filter((w) => w.inPlan !== false);

  const toggle = (wall: RoomRegion, on: boolean) => {
    // Shown at once; put back if the server refuses — that wall only, so a toggle made
    // meanwhile on another wall is not undone with it.
    const setInPlan = (value: boolean) =>
      queryClient.setQueryData<RoomDetail>(keys.room(id), (room) =>
        room ? { ...room, regions: room.regions.map((r) => (r.id === wall.id ? { ...r, inPlan: value } : r)) } : room,
      );
    setInPlan(on);
    projectsApi.savePlan(id, [{ regionId: wall.id, inPlan: on }]).catch((err: unknown) => {
      setInPlan(!on);
      toast.show(messageFor(err), "error");
    });
  };

  if (room.isError) {
    return (
      <Screen>
        <BackButton fallback="/studio" />
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  const photo = roomPhoto(data);
  // "Tap a wall to find it": the wall picked (on the photo or in the list) shows fully, the
  // rest fade back.
  const shown = canvasWalls(data, (r) => ({
    hex: r.inPlan === false ? null : (tintOf.get(r.id) ?? null),
    strength: selected && selected !== String(r.id) ? 0.35 : 1,
  }));
  const banner = reportLine(report.data);
  const goPaint = () =>
    router.push({ pathname: "/room/[projectId]/paint", params: { projectId: id, shade: params.shade, brand: params.brand } } as Href);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={{ paddingHorizontal: space.gutter, gap: space.sm }}>
        <BackButton fallback="/studio" />
        <StepDots current="walls" />
      </View>
      <View style={{ flex: 1, minHeight: 200, marginTop: space.sm, backgroundColor: colors.bgDeep }}>
        <RoomCanvas
          ref={canvasRef}
          photo={photo.load}
          photoKey={photo.key}
          walls={shown}
          cleaned={Boolean(data.cleanedImageUrl)}
          onState={setCanvas}
          onTapWall={setSelected}
          accessibilityLabel={t("walls.canvasLabel")}
          testID="walls-canvas"
        />
        {/* Over the photo, so a note that comes and goes doesn't resize the canvas. */}
        <View pointerEvents="box-none" style={[styles.overlay, { padding: space.gutter, gap: space.xs }]}>
          {canvas.kind === "noGl" ? <Banner tone="warning" message={t("paint.noGl")} /> : null}
          <CanvasTrouble state={canvas} onRetry={() => canvasRef.current?.retry()} />
        </View>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={{ padding: space.gutter, gap: space.md }}>
        <View style={{ gap: space.xxs }}>
          <Text variant="title2" accessibilityRole="header">
            {t("walls.title")}
          </Text>
          <Text variant="small" tone="soft">
            {t("walls.lead")}
          </Text>
        </View>
        {data.detectedWallColour ? (
          <View style={styles.today}>
            {data.detectedWallHex ? (
              <View style={[styles.dot, { backgroundColor: data.detectedWallHex, borderColor: colors.ruleStrong }]} />
            ) : null}
            <Text variant="small" tone="soft">
              {t("walls.today", { colour: data.detectedWallColour })}
            </Text>
          </View>
        ) : null}
        {banner ? <Banner tone="info" message={banner} /> : null}

        <View style={[styles.group, { borderColor: colors.rule, borderRadius: radius.md, backgroundColor: colors.surface }]}>
          {walls.map((w, i) => {
            const key = String(w.id);
            const on = w.inPlan !== false;
            return (
              <Pressable
                key={w.id}
                onPress={() => setSelected(selected === key ? null : key)}
                style={[
                  styles.row,
                  {
                    borderTopWidth: i === 0 ? 0 : hairline,
                    borderTopColor: colors.rule,
                    backgroundColor: selected === key ? colors.surfaceSoft : "transparent",
                    paddingHorizontal: space.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === key }}
              >
                <View style={[styles.dot, { backgroundColor: on ? tintOf.get(w.id) : "transparent", borderColor: tintOf.get(w.id) }]} />
                <Text variant="body" style={{ flex: 1 }}>
                  {wallLabel(w)}
                </Text>
                <Switch
                  value={on}
                  onValueChange={(next) => toggle(w, next)}
                  accessibilityLabel={`${t("walls.paintThis")}: ${wallLabel(w)}`}
                  trackColor={{ true: colors.accent, false: colors.ruleStrong }}
                  thumbColor={colors.ivory}
                  {...{ activeThumbColor: colors.ivory }}
                  testID={`plan-${w.id}`}
                />
              </Pressable>
            );
          })}
        </View>
        {inPlan.length === 0 ? <Text variant="small" tone="mute">{t("walls.noneInPlan")}</Text> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.sm, paddingTop: space.xs, gap: space.xxs }}>
        <Button label={t("walls.start")} icon="droplet" onPress={goPaint} disabled={inPlan.length === 0} />
        <View style={styles.links}>
          <Button
            variant="ghost"
            block={false}
            label={t("walls.fix")}
            onPress={() => router.push({ pathname: "/room/[projectId]/adjust", params: { projectId: id } } as Href)}
          />
          <Button
            variant="ghost"
            block={false}
            label={t("walls.wrong")}
            onPress={() => router.push({ pathname: "/room/[projectId]/report", params: { projectId: id } } as Href)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0, maxHeight: "45%" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  today: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  group: { borderWidth: hairline, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  links: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
});
