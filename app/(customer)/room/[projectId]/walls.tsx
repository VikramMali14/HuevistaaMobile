import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { projectsApi } from "@/api/endpoints/projects";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { RoomRegion } from "@/api/types";
import { BackButton, Banner, Button, ErrorState, Screen, StepDots, Text, useToast } from "@/components/ui";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { RoomCanvas, type CanvasState } from "@/features/studio/engine/RoomCanvas";
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

  const data = room.data;
  const walls = useMemo(() => (data ? wallsWithMasks(data) : []), [data]);
  const tintOf = useMemo(() => new Map(walls.map((w, i) => [w.id, WALL_TINTS[i % WALL_TINTS.length]!])), [walls]);
  const inPlan = walls.filter((w) => w.inPlan !== false);

  const toggle = (wall: RoomRegion, on: boolean) => {
    if (!data) return;
    const before = data;
    // Shown at once; put back if the server refuses.
    queryClient.setQueryData(keys.room(id), {
      ...data,
      regions: data.regions.map((r) => (r.id === wall.id ? { ...r, inPlan: on } : r)),
    });
    projectsApi.savePlan(id, [{ regionId: wall.id, inPlan: on }]).catch((err: unknown) => {
      queryClient.setQueryData(keys.room(id), before);
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
  const shown = canvasWalls(data, (r) => ({ hex: r.inPlan === false ? null : (tintOf.get(r.id) ?? null) }));
  const banner = reportLine(report.data);
  const goPaint = () =>
    router.push({ pathname: "/room/[projectId]/paint", params: { projectId: id, shade: params.shade, brand: params.brand } } as Href);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={{ paddingHorizontal: space.gutter, gap: space.sm }}>
        <BackButton fallback="/studio" />
        <StepDots current="walls" />
      </View>
      <RoomCanvas
        photo={photo.load}
        photoKey={photo.key}
        walls={shown}
        cleaned={Boolean(data.cleanedImageUrl)}
        onState={setCanvas}
        onTapWall={setSelected}
        style={{ flex: 1, minHeight: 200, marginTop: space.sm, backgroundColor: colors.bgDeep }}
        testID="walls-canvas"
      />
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
        {canvas.kind === "failed" ? <Banner tone="danger" message={t("paint.loadFailed")} /> : null}

        <View style={[styles.group, { borderColor: colors.rule, borderRadius: radius.md, backgroundColor: colors.surface }]}>
          {walls.map((w, i) => {
            const key = String(w.id);
            const on = w.inPlan !== false;
            return (
              <Pressable
                key={w.id}
                onPress={() => setSelected(key)}
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
  today: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  group: { borderWidth: hairline, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  links: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
});
