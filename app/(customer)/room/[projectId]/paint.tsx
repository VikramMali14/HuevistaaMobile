import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { RoomRegion } from "@/api/types";
import { BackButton, Banner, Button, ErrorState, IconButton, Screen, Text, useToast, ZoomView } from "@/components/ui";
import { useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { daysLeft } from "@/features/rooms/room-status";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { markPaintHowToSeen, PaintHowTo, paintHowToSeen } from "@/features/studio/PaintHowTo";
import { PaintPalette } from "@/features/studio/PaintPalette";
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
import { StepNumber } from "@/features/studio/StepNumber";
import { scopeOf, useDockSuggestions } from "@/features/studio/suggested-swatches";
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
 *
 * Laid out as three numbered steps down the left of the dock — 1 the walls, 2 the
 * colours, 3 Save — for somebody who has never used a tool like this, or who would
 * sooner look than read. The first visit on a phone opens "How it works", which says
 * the same three steps in pictures; Help opens it again.
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
  const [howTo, setHowTo] = useState(false);
  const howToOffered = useRef(false);
  const shadeApplied = useRef(false);

  const data = room.data;
  const walls = useMemo(() => (data ? planWalls(wallsWithMasks(data)) : []), [data]);
  const wallIds = useMemo(() => walls.map((w) => String(w.id)), [walls]);
  const editable = Boolean(data && !data.readOnly && !data.closedAt);
  const recentCodes = useMemo(() => recent.map((r) => r.code), [recent]);
  const suggested = useDockSuggestions(scopeOf(data?.imageType), editable, recentCodes);

  useEffect(() => {
    if (data) initRoom(id, data, wallIds, readColour);
  }, [data, id, wallIds, readColour]);

  useEffect(() => {
    void markPainted(id);
  }, [id]);

  // "How it works" opens by itself once per phone: the first time Paint has a room
  // that can be painted. It is marked seen as it opens, so leaving mid-sheet does not
  // bring it back; Help in the top bar opens it any time after.
  const paintable = editable && walls.length > 0;
  useEffect(() => {
    if (!paintable || howToOffered.current) return;
    howToOffered.current = true;
    let live = true;
    void paintHowToSeen().then((seen) => {
      if (!live || seen) return;
      setHowTo(true);
      void markPaintHowToSeen();
    });
    return () => {
      live = false;
    };
  }, [paintable]);

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

  const pick = (colour: WallColour, brandSlug?: string | null) => {
    if (!editable || !paint.selected) return;
    applyColours(id, { [paint.selected]: colour });
    if (colour.code) pushRecent({ hex: colour.hex, code: colour.code, lrv: colour.lrv, brandSlug });
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
  const selectedColour = paint.selected ? (paint.colours[paint.selected] ?? null) : null;
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
        {/* Undo and Redo arrive with something to take back or put back. Two greyed
            arrows at rest are two buttons that refuse, on the screen a first visit is
            least sure of; and they leave the room's name more of the bar. */}
        {editable && paint.history.length > 0 ? <IconButton icon="corner-up-left" label={t("paint.undo")} onPress={() => undo(id)} /> : null}
        {editable && paint.future.length > 0 ? <IconButton icon="corner-up-right" label={t("paint.redo")} onPress={() => redo(id)} /> : null}
        <IconButton
          icon="columns"
          label={t("paint.compare")}
          onPress={() => router.push({ pathname: "/room/[projectId]/compare", params: { projectId: id } } as Href)}
        />
        <IconButton icon="help-circle" label={t("paint.help")} onPress={() => setHowTo(true)} testID="paint-help" />
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
            selected={paint.selected}
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
          {canvas.kind === "noGl" ? <Banner tone="warning" message={t("paint.noGl")} /> : null}
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
          {/* Step 1, the walls. Also chosen by tapping the wall on the photo. */}
          <View style={styles.stepRow}>
            {editable ? <StepNumber n={1} style={{ marginLeft: space.gutter }} /> : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.fill}
              contentContainerStyle={{ gap: space.xs, paddingLeft: editable ? space.xs : space.gutter, paddingRight: space.gutter }}
            >
              {walls.map((w) => {
                const key = String(w.id);
                const c = paint.colours[key];
                const on = paint.selected === key;
                // The chosen wall is the ink capsule, as a chosen option is everywhere
                // else in the app — an outline among outlines was a difference somebody
                // had to look for.
                const ink = on ? colors.bg : colors.fg;
                return (
                  <Pressable
                    key={key}
                    onPress={() => selectWall(id, key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${wallLabel(w)}, ${c?.code ?? (c ? c.hex : t("paint.unpainted"))}`}
                    style={[
                      styles.wallChip,
                      { borderRadius: radius.pill, borderColor: on ? colors.fg : colors.ruleStrong, backgroundColor: on ? colors.fg : colors.surface },
                    ]}
                    testID={`wall-${key}`}
                  >
                    <View style={[styles.wallDot, { backgroundColor: c?.hex ?? "transparent", borderColor: on ? colors.bg : colors.ruleStrong }]} />
                    <Text variant="bodyStrong" numberOfLines={1} style={{ color: ink }}>
                      {wallLabel(w)}
                    </Text>
                    {c?.code ? (
                      <Text variant="caption" style={{ color: on ? colors.bg : colors.fgMute, opacity: on ? 0.8 : 1 }}>
                        {c.code}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {editable ? (
            <>
              {/* Step 2, the colours. */}
              <PaintPalette current={selectedColour} suggested={suggested} onPick={pick} disabled={!paint.selected} gutter={space.gutter} step={2} />
              <View style={[styles.actions, { paddingLeft: space.gutter, paddingRight: space.xs }]}>
                {/* Step 3: keep it. The one filled button in the dock, numbered like the
                    two rows above it, so 1 · 2 · 3 runs down the left edge in the order
                    the screen is used. Saving keeps the combination for the board. */}
                <Pressable
                  onPress={saveThis}
                  accessibilityRole="button"
                  accessibilityLabel={t("paint.save")}
                  style={({ pressed }) => [
                    styles.saveButton,
                    { backgroundColor: colors.accent, borderRadius: radius.pill, opacity: pressed ? 0.85 : 1 },
                  ]}
                  testID="paint-save"
                >
                  <StepNumber n={3} tone="onAccent" />
                  <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.accentOn }}>
                    {t("paint.save")}
                  </Text>
                </Pressable>
                <View style={styles.fill} />
                <Button
                  variant="ghost"
                  block={false}
                  icon="droplet"
                  label={t("paint.browse")}
                  onPress={() => router.push({ pathname: "/shade-picker", params: { projectId: id, regionId: paint.selected ?? "" } })}
                  disabled={!paint.selected}
                  testID="paint-browse"
                />
                <Button
                  variant="ghost"
                  block={false}
                  icon="star"
                  label={t("paint.suggestions")}
                  onPress={() => router.push({ pathname: "/room/[projectId]/suggestions", params: { projectId: id } } as Href)}
                  testID="paint-ideas"
                />
              </View>
            </>
          ) : null}
        </View>
      )}

      {/* How it works — and, at its foot, the shade disclaimer the ⓘ used to keep. */}
      <PaintHowTo visible={howTo} onClose={() => setHowTo(false)} />
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
  stepRow: { flexDirection: "row", alignItems: "center" },
  wallChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingLeft: 8, paddingRight: 14, paddingVertical: 6, minHeight: 44 },
  wallDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  saveButton: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 10, paddingRight: 18 },
});
