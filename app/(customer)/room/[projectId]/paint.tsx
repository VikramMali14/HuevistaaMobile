import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { RoomRegion } from "@/api/types";
import { BackButton, Banner, Button, Disclaimer, ErrorState, IconButton, Screen, Sheet, Text, useToast, ZoomView } from "@/components/ui";
import { useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { daysLeft } from "@/features/rooms/room-status";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { RoomCanvas, type CanvasState, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import {
  applyColours,
  clearRefused,
  flush,
  initRoom,
  pushRecent,
  redo,
  selectWall,
  undo,
  useRecentShades,
  useRoomPaint,
  type WallColour,
} from "@/features/studio/paint-store";
import { shadeColour } from "@/features/studio/shade-colour";
import { saveCombo, useTray } from "@/features/studio/tray-store";
import { useColourReader } from "@/features/studio/use-colour-reader";
import { markPainted, useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls, wallLabel } from "@/features/studio/wall-plan";
import { t } from "@/i18n";
import { hairline, useTheme } from "@/theme";

/**
 * C11 · Paint (step 5) — the most important screen. Spec: docs/04-screens-customer.md — C11.
 *
 * The room, live: tap a wall, then a colour. Every painted wall stays painted while
 * another is chosen; light and shadow are the photo's own (the website's engine on
 * expo-gl). Colours save themselves a moment after the last change, and wait for the
 * connection when there is none. Press and hold the photo to see it before.
 */
export default function Paint() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, radius, space } = useTheme();
  const params = useLocalSearchParams<{ projectId: string; shade?: string; brand?: string }>();
  const id = params.projectId ?? "";
  const room = useRoom(id);
  const paint = useRoomPaint(id);
  const recent = useRecentShades();
  const tray = useTray(id);
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const readColour = useColourReader();
  const canvasRef = useRef<RoomCanvasHandle>(null);
  const [canvas, setCanvas] = useState<CanvasState>({ kind: "loading" });
  const [holding, setHolding] = useState(false);
  const [info, setInfo] = useState(false);
  const shadeApplied = useRef(false);

  const data = room.data;
  const walls = useMemo(() => (data ? planWalls(wallsWithMasks(data)) : []), [data]);
  const wallIds = useMemo(() => walls.map((w) => String(w.id)), [walls]);
  const editable = Boolean(data && !data.readOnly && !data.closedAt);

  useEffect(() => {
    if (data) initRoom(id, data, wallIds, readColour);
  }, [data, id, wallIds, readColour]);

  useEffect(() => {
    void markPainted(id);
  }, [id]);

  // Leaving the screen sends anything still waiting; a refusal already shown is done with.
  useFocusEffect(
    useCallback(
      () => () => {
        void flush(id);
        clearRefused(id);
      },
      [id],
    ),
  );

  // A shade chosen on C19 ("Try it on a room") goes on the first wall, once.
  useEffect(() => {
    if (shadeApplied.current || !params.shade || !editable || !catalogue.data || !paint.selected) return;
    const wanted = params.shade.toUpperCase();
    const shade = catalogue.data.shades.find(
      (s) => (s.hvCode ?? "").toUpperCase() === wanted || s.code.toUpperCase() === wanted,
    );
    shadeApplied.current = true;
    if (!shade) return;
    const colour = shadeColour(shade, scheme);
    applyColours(id, { [paint.selected]: colour });
    pushRecent({ hex: colour.hex, code: colour.code ?? "", lrv: colour.lrv, brandSlug: shade.brandSlug });
  }, [params.shade, editable, catalogue.data, paint.selected, id, scheme]);

  const put = (colour: WallColour) => {
    if (!editable || !paint.selected) return;
    applyColours(id, { [paint.selected]: colour });
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
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]} testID="paint-loading">
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  const photo = roomPhoto(data);
  const shown = canvasWalls(data, (r: RoomRegion) => {
    const c = r.inPlan === false ? null : paint.colours[String(r.id)];
    return { hex: c?.hex ?? null, lrv: c?.lrv };
  });
  const selectedWall = walls.find((w) => String(w.id) === paint.selected) ?? null;
  const left = data.fromLibrary ? null : daysLeft(data);
  const name = data.name?.trim() || t("rooms.untitled");

  const saveThis = () => {
    if (!wallIds.some((w) => paint.colours[w])) {
      toast.show(t("paint.nothingToSave"), "info");
      return;
    }
    const ok = saveCombo(id, paint.colours, wallIds);
    toast.show(ok ? t("paint.saved") : t("paint.savedAlready"), ok ? "success" : "info");
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top }]}>
      <View style={[styles.top, { paddingHorizontal: space.xs }]}>
        <BackButton fallback="/studio" />
        <Text variant="bodyStrong" numberOfLines={1} style={styles.title} accessibilityRole="header">
          {name}
        </Text>
        <IconButton icon="corner-up-left" label={t("paint.undo")} onPress={() => undo(id)} disabled={!editable || paint.history.length === 0} />
        <IconButton icon="corner-up-right" label={t("paint.redo")} onPress={() => redo(id)} disabled={!editable || paint.future.length === 0} />
        <IconButton
          icon="columns"
          label={t("paint.compare")}
          onPress={() => router.push({ pathname: "/room/[projectId]/compare", params: { projectId: id } } as Href)}
        />
        <IconButton
          icon="layers"
          label={t("paint.tray")}
          badge={tray.length}
          onPress={() => router.push({ pathname: "/room/[projectId]/board", params: { projectId: id } } as Href)}
          testID="paint-tray"
        />
      </View>

      <View style={{ paddingHorizontal: space.gutter, gap: space.xs }}>
        {!editable ? <Banner tone="info" message={data.readOnlyReason?.trim() || t("paint.readOnly")} /> : null}
        {editable && left !== null && left <= 3 ? (
          <Banner
            tone="warning"
            message={left === 0 ? t("paint.closesToday") : left === 1 ? t("paint.oneDayLeft") : t("paint.daysLeft", { n: left })}
          />
        ) : null}
        {canvas.kind === "noGl" ? <Banner tone="warning" message={t("paint.noGl")} /> : null}
      </View>

      <View style={styles.fill}>
        <ZoomView resetKey={photo.key}>
          <RoomCanvas
            ref={canvasRef}
            photo={photo.load}
            photoKey={photo.key}
            walls={shown}
            cleaned={Boolean(data.cleanedImageUrl)}
            showOriginal={holding}
            onState={setCanvas}
            onTapWall={(wall) => wall && wallIds.includes(wall) && selectWall(id, wall)}
            onHold={setHolding}
            accessibilityLabel={editable ? t("paint.canvasLabel") : t("paint.canvasLabelView")}
            testID="paint-canvas"
          />
        </ZoomView>
        {/* Over the photo, not above it: notes that come and go must not resize the canvas
            (which would start the GPU over each time). */}
        <View pointerEvents="box-none" style={[styles.overlay, { padding: space.gutter, gap: space.xs }]}>
          {paint.refused ? <Banner tone="danger" message={t("paint.refused", { reason: paint.refused })} testID="paint-refused" /> : null}
          <CanvasTrouble state={canvas} onRetry={() => canvasRef.current?.retry()} />
          {paint.saveFailed ? <Banner tone="warning" message={t("paint.savingFailed")} testID="paint-save-failed" /> : null}
        </View>
      </View>
      {holding ? (
        <View pointerEvents="none" style={[styles.beforePill, { top: insets.top + 64, backgroundColor: `${colors.bg}e6`, borderRadius: radius.pill }]}>
          <Text variant="small">{t("paint.original")}</Text>
        </View>
      ) : null}

      {walls.length === 0 ? (
        <View style={{ padding: space.gutter, gap: space.sm }}>
          <Text variant="body" tone="soft">
            {t("paint.noWalls")}
          </Text>
          {editable ? (
            <Button
              label={t("paint.markWalls")}
              onPress={() => router.replace({ pathname: "/room/[projectId]/adjust", params: { projectId: id } } as Href)}
            />
          ) : null}
        </View>
      ) : (
        <View style={[styles.dock, { backgroundColor: colors.bg, paddingBottom: insets.bottom + space.sm, borderTopColor: colors.rule }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.gutter }}>
            {walls.map((w) => {
              const key = String(w.id);
              const c = paint.colours[key];
              const on = paint.selected === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => selectWall(id, key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${wallLabel(w)}, ${c?.code ?? (c ? c.hex : t("paint.unpainted"))}`}
                  style={[
                    styles.wallChip,
                    { borderRadius: radius.pill, borderColor: on ? colors.fg : colors.ruleStrong, backgroundColor: on ? colors.surfaceSoft : colors.surface },
                  ]}
                  testID={`wall-${key}`}
                >
                  <View style={[styles.wallDot, { backgroundColor: c?.hex ?? "transparent", borderColor: colors.ruleStrong }]} />
                  <Text variant="small" numberOfLines={1}>
                    {wallLabel(w)}
                  </Text>
                  {c?.code ? (
                    <Text variant="caption" tone="mute">
                      {c.code}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {editable ? (
            <>
              {recent.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.gutter }}>
                  {recent.map((r) => (
                    <Pressable
                      key={r.code}
                      onPress={() => put({ hex: r.hex, code: r.code, lrv: r.lrv })}
                      accessibilityRole="button"
                      accessibilityLabel={`${t("paint.recent")}: ${r.code}`}
                      style={[styles.swatch, { backgroundColor: r.hex, borderColor: colors.ruleStrong }]}
                    />
                  ))}
                </ScrollView>
              ) : (
                // As tall as the swatches it gives way to: the first colour picked must not
                // resize the canvas (which would start the GPU over).
                <View style={[styles.hint, { paddingHorizontal: space.gutter }]}>
                  <Text variant="small" tone="mute">
                    {selectedWall ? t("paint.holdHint") : t("paint.pickWall")}
                  </Text>
                </View>
              )}
              <View style={{ paddingHorizontal: space.gutter }}>
                <Button
                  label={t("paint.browse")}
                  icon="droplet"
                  onPress={() => router.push({ pathname: "/shade-picker", params: { projectId: id, regionId: paint.selected ?? "" } })}
                  disabled={!paint.selected}
                  testID="paint-browse"
                />
              </View>
              <View style={[styles.actions, { paddingHorizontal: space.xs }]}>
                <Button
                  variant="ghost"
                  block={false}
                  label={t("paint.suggestions")}
                  onPress={() => router.push({ pathname: "/room/[projectId]/suggestions", params: { projectId: id } } as Href)}
                />
                <Button variant="ghost" block={false} label={t("paint.save")} onPress={saveThis} testID="paint-save" />
                <View style={styles.fill} />
                <IconButton icon="info" label={t("paint.info")} onPress={() => setInfo(true)} />
              </View>
            </>
          ) : null}
        </View>
      )}

      <Sheet visible={info} onClose={() => setInfo(false)} title={t("paint.info")}>
        <Disclaimer kind="shades" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 2 },
  title: { flex: 1, marginHorizontal: 4 },
  beforePill: { position: "absolute", alignSelf: "center", paddingHorizontal: 14, paddingVertical: 6 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  dock: { paddingTop: 10, gap: 10, borderTopWidth: hairline },
  wallChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  wallDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: hairline },
  hint: { minHeight: 40, justifyContent: "center" },
  actions: { flexDirection: "row", alignItems: "center" },
});
