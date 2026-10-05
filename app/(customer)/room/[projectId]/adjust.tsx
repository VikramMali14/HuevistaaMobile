import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation, useRouter, type Href } from "expo-router";
import { usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { projectsApi } from "@/api/endpoints/projects";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { RegionCategory } from "@/api/types";
import {
  BackButton,
  Banner,
  Button,
  Chip,
  ConfirmSheet,
  ErrorState,
  IconButton,
  ListGroup,
  ListRow,
  Screen,
  Sheet,
  StepDots,
  Text,
  useToast,
  ZoomView,
} from "@/components/ui";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { brushRadius, coverageOf, encodeMaskPng, toBase64, type BrushSize, type MaskOp, type Point } from "@/features/studio/engine/mask-ops";
import { RoomCanvas, type CanvasState, type CanvasWall, type PointerPhase, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { WALL_TINTS, wallLabel } from "@/features/studio/wall-plan";
import { t, type MessageKey } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

type Tool = "brush" | "eraser" | "shape";

/** A wall drawn here and not yet saved. */
interface NewWall {
  key: string;
  category: RegionCategory;
  label: string;
}

type Exit = { kind: "paint" } | { kind: "action"; action: NavigationAction };

const NEW_WALL_KINDS: { category: RegionCategory; label: MessageKey }[] = [
  { category: "MAIN_WALL", label: "walls.categories.MAIN_WALL" },
  { category: "ACCENT_WALL", label: "walls.categories.ACCENT_WALL" },
  { category: "TRIM", label: "walls.categories.TRIM" },
  { category: "CEILING", label: "walls.categories.CEILING" },
  { category: "OTHER_WALL", label: "adjust.other" },
];

/** A copy of `map` without `drop`. */
function without<T>(map: Record<string, T>, drop: readonly string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(map).filter(([k]) => !drop.includes(k)));
}

/**
 * C10 · Adjust walls (step 4). Spec: docs/04-screens-customer.md — C10.
 *
 * The photo full screen; one finger draws (Brush adds, Eraser removes, Shape fills the
 * corners tapped), two fingers zoom and move. Undo and Redo per wall. New wall picks what
 * it is first. Done saves every wall that changed — at the photo's own size, as the
 * backend wants — and goes on to Paint. A ready-made room's walls are fixed.
 *
 * Every wall's edits are kept as a list, not as a picture on the GPU: what is shown and
 * what is saved are both drawn from the lists, so nothing is lost if the canvas starts
 * over, and each wall keeps its own Undo. Leaving with edits unsaved asks first — the
 * back button, the swipe and Android's back alike.
 */
export default function AdjustWalls() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, radius, space } = useTheme();
  const params = useLocalSearchParams<{ projectId: string; notice?: string }>();
  const id = params.projectId ?? "";
  const room = useRoom(id);
  const canvas = useRef<RoomCanvasHandle>(null);
  const nextNew = useRef(1);
  const [canvasState, setCanvasState] = useState<CanvasState>({ kind: "loading" });
  const [tool, setTool] = useState<Tool>("brush");
  const [size, setSize] = useState<BrushSize>("medium");
  const [current, setCurrent] = useState<string | null>(null);
  const [newWalls, setNewWalls] = useState<NewWall[]>([]);
  /** The wall being edited: its edits, and what Undo took off. */
  const [ops, setOps] = useState<MaskOp[]>([]);
  const [redo, setRedo] = useState<MaskOp[]>([]);
  /** Every other wall's edits (only walls that have some), and their Redo. */
  const [edits, setEdits] = useState<Record<string, MaskOp[]>>({});
  const [redos, setRedos] = useState<Record<string, MaskOp[]>>({});
  const [live, setLive] = useState<MaskOp | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** They asked to leave with edits unsaved: the navigation to carry out if they confirm. */
  const [leaving, setLeaving] = useState<NavigationAction | null>(null);
  const [exit, setExit] = useState<Exit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useSubmit();
  const removing = useSubmit();

  const data = room.data;
  const found = useMemo(() => (data ? wallsWithMasks(data) : []), [data]);
  const fixed = Boolean(data?.fromLibrary);
  const allKeys = [...found.map((w) => String(w.id)), ...newWalls.map((w) => w.key)];
  const tintOf = (key: string) => WALL_TINTS[Math.max(0, allKeys.indexOf(key)) % WALL_TINTS.length]!;
  const wallKey = current && allKeys.includes(current) ? current : (allKeys[0] ?? null);
  const dirty = !fixed && (ops.length > 0 || Object.keys(edits).length > 0);
  const photoSize = canvasState.kind === "ready" ? canvasState : null;

  const labelOf = (key: string) => {
    const f = found.find((w) => String(w.id) === key);
    return f ? wallLabel(f) : (newWalls.find((w) => w.key === key)?.label ?? "");
  };

  // Leaving with edits unsaved asks first, however they leave.
  usePreventRemove(dirty && !exit, ({ data: e }) => setLeaving(e.action));
  useEffect(() => {
    if (!exit) return;
    if (exit.kind === "paint") router.replace({ pathname: "/room/[projectId]/paint", params: { projectId: id } } as Href);
    else navigation.dispatch(exit.action);
  }, [exit, id, navigation, router]);

  const walls: CanvasWall[] = useMemo(() => {
    if (!data) return [];
    const loaded = canvasWalls(data, (r) => ({ hex: WALL_TINTS[found.indexOf(r) % WALL_TINTS.length]! }));
    return [
      ...loaded,
      ...newWalls.map((w, i) => ({ id: w.key, maskKey: w.key, manual: true, hex: WALL_TINTS[(found.length + i) % WALL_TINTS.length]! })),
    ];
  }, [data, found, newWalls]);

  // The corners being laid out show where the shape will go (Fill, or Done, applies it).
  const cornerOps: MaskOp[] = [];
  if (tool === "shape" && corners.length && photoSize) {
    if (corners.length >= 3) cornerOps.push({ kind: "shape", add: true, points: corners });
    const dot = brushRadius("small", photoSize);
    for (const c of corners) cornerOps.push({ kind: "stroke", add: true, radius: dot, points: [c] });
  }
  const shown = [...ops, ...(live ? [live] : []), ...cornerOps];
  const edit = wallKey && !fixed ? { wallId: wallKey, tint: tintOf(wallKey), ops: shown } : null;

  /** Move to another wall: this one's edits are kept, that one's come back with its Undo. */
  const switchTo = (key: string) => {
    if (key === wallKey) return;
    const nextEdits = { ...edits };
    const nextRedos = { ...redos };
    if (wallKey) {
      if (ops.length) nextEdits[wallKey] = ops;
      else delete nextEdits[wallKey];
      if (redo.length) nextRedos[wallKey] = redo;
      else delete nextRedos[wallKey];
    }
    setOps(nextEdits[key] ?? []);
    setRedo(nextRedos[key] ?? []);
    setEdits(without(nextEdits, [key]));
    setRedos(without(nextRedos, [key]));
    setCorners([]);
    setLive(null);
    setCurrent(key);
  };

  const onPointer = (phase: PointerPhase, p: Point) => {
    if (fixed || !wallKey || !photoSize) return;
    if (tool === "shape") {
      if (phase === "end") setCorners((c) => [...c, p]);
      return;
    }
    const r = brushRadius(size, photoSize);
    if (phase === "start") {
      setLive({ kind: "stroke", add: tool === "brush", radius: r, points: [p] });
    } else if (phase === "move") {
      setLive((s) => {
        if (!s || s.kind !== "stroke") return s;
        const last = s.points[s.points.length - 1]!;
        return Math.hypot(p[0] - last[0], p[1] - last[1]) < r / 3 ? s : { ...s, points: [...s.points, p] };
      });
    } else if (phase === "end") {
      setLive((s) => {
        if (s) {
          setOps((o) => [...o, s]);
          setRedo([]);
        }
        return null;
      });
    } else {
      // A second finger took over (zoom): drop the half-drawn stroke.
      setLive(null);
    }
  };

  const shapeOp = (): MaskOp | null => (corners.length >= 3 ? { kind: "shape", add: true, points: corners } : null);

  const fill = () => {
    const shape = shapeOp();
    if (!shape) return;
    setOps((o) => [...o, shape]);
    setRedo([]);
    setCorners([]);
  };

  const undoOne = () => {
    const last = ops[ops.length - 1];
    if (!last) return;
    setOps(ops.slice(0, -1));
    setRedo([last, ...redo]);
  };
  const redoOne = () => {
    const next = redo[0];
    if (!next) return;
    setOps([...ops, next]);
    setRedo(redo.slice(1));
  };

  const addWall = (category: RegionCategory, label: string) => {
    const key = `new-${nextNew.current++}`;
    setNewWalls((w) => [...w, { key, category, label }]);
    setPicking(false);
    switchTo(key);
  };

  /** Walls now saved: their edits are done with (the room, read again, shows them). */
  const forgetSaved = (saved: readonly string[]) => {
    if (!saved.length) return;
    setEdits((e) => without(e, saved));
    setRedos((r) => without(r, saved));
    if (wallKey && saved.includes(wallKey)) {
      setOps([]);
      setRedo([]);
    }
    setNewWalls((w) => w.filter((x) => !saved.includes(x.key)));
  };

  const done = () => {
    // Corners laid out and not filled yet are meant: the website applies them on Save too.
    const shape = !fixed && tool === "shape" ? shapeOp() : null;
    if (!dirty && !shape) {
      setExit({ kind: "paint" });
      return;
    }
    const mine = shape ? [...ops, shape] : ops;
    if (shape) {
      setOps(mine);
      setRedo([]);
      setCorners([]);
    }
    const all: Record<string, MaskOp[]> = { ...edits, ...(wallKey && mine.length ? { [wallKey]: mine } : {}) };
    void saving.run(async () => {
      setError(null);
      // Every mask first, so an empty one stops the save before anything is sent: an empty
      // mask would erase the wall while looking like an edit (website mask-studio).
      const masks: { key: string; coverage: Uint8Array; width: number; height: number }[] = [];
      for (const [key, list] of Object.entries(all)) {
        const mask = canvas.current?.bake(key, list);
        if (!mask) {
          setError(t("adjust.notReady"));
          return;
        }
        const coverage = coverageOf(mask.data, mask.width, mask.height);
        if (!coverage.includes(255)) {
          setError(t("adjust.emptyWall", { wall: labelOf(key) }));
          return;
        }
        masks.push({ key, coverage, width: mask.width, height: mask.height });
      }
      const saved: string[] = [];
      try {
        for (const m of masks) {
          const maskBase64 = toBase64(encodeMaskPng(m.coverage, m.width, m.height));
          const added = newWalls.find((w) => w.key === m.key);
          if (added) await projectsApi.addWall(id, { maskBase64, label: added.label, category: added.category });
          else await projectsApi.replaceMask(id, Number(m.key), maskBase64);
          saved.push(m.key);
        }
        await queryClient.invalidateQueries({ queryKey: keys.room(id) });
        void queryClient.invalidateQueries({ queryKey: keys.projects, exact: true });
        setExit({ kind: "paint" });
      } catch (err) {
        // What was saved stays saved; the rest keep their edits to try again.
        forgetSaved(saved);
        if (saved.length) void queryClient.invalidateQueries({ queryKey: keys.room(id) });
        setError(t("adjust.saveFailed", { reason: messageFor(err) }));
      }
    });
  };

  const removeWall = () => {
    if (!wallKey) return;
    const key = wallKey;
    const forget = () => {
      setEdits((e) => without(e, [key]));
      setRedos((r) => without(r, [key]));
      setOps([]);
      setRedo([]);
      setCorners([]);
      setCurrent(null);
      setDeleting(false);
    };
    if (newWalls.some((w) => w.key === key)) {
      setNewWalls((w) => w.filter((x) => x.key !== key));
      forget();
      return;
    }
    void removing.run(async () => {
      try {
        await projectsApi.removeWall(id, Number(key));
        await queryClient.invalidateQueries({ queryKey: keys.room(id) });
        forget();
        toast.show(t("adjust.deleted"), "success");
      } catch (err) {
        setDeleting(false);
        toast.show(messageFor(err), "error");
      }
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
  const currentFound = found.find((w) => String(w.id) === wallKey);
  const currentNew = newWalls.find((w) => w.key === wallKey);
  const canDelete = Boolean(currentNew || (currentFound?.manual && found.length > 1));
  const notice = params.notice === "auto" || data.autoMaskFailed ? data.autoMaskNotice?.trim() : null;

  return (
    <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top }]}>
      <View style={[styles.top, { paddingHorizontal: space.xs }]}>
        <IconButton icon="arrow-left" label={t("common.back")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/studio"))} />
        <View style={styles.fill} />
        {!fixed ? (
          <>
            <IconButton icon="corner-up-left" label={t("adjust.undo")} onPress={undoOne} disabled={ops.length === 0} />
            <IconButton icon="corner-up-right" label={t("adjust.redo")} onPress={redoOne} disabled={redo.length === 0} />
          </>
        ) : null}
        <Button block={false} label={t("adjust.done")} onPress={done} loading={saving.busy} />
      </View>

      <View style={{ paddingHorizontal: space.gutter, gap: space.xs, paddingTop: space.xs }}>
        <StepDots current="adjust" />
        {fixed ? (
          <Banner tone="info" message={t("adjust.fixed")} />
        ) : (
          <Text variant="small" tone="soft">
            {t("adjust.lead")}
          </Text>
        )}
        {notice ? <Banner tone="info" message={notice} /> : null}
        {canvasState.kind === "noGl" ? <Banner tone="warning" message={t("paint.noGl")} /> : null}
      </View>

      <View style={[styles.fill, { marginTop: space.xs }]}>
        <ZoomView resetKey={photo.key}>
          <RoomCanvas
            ref={canvas}
            photo={photo.load}
            photoKey={photo.key}
            walls={walls}
            cleaned={Boolean(data.cleanedImageUrl)}
            edit={edit}
            edits={edits}
            onPointer={onPointer}
            onState={setCanvasState}
            accessibilityLabel={fixed ? undefined : t("adjust.canvasLabel")}
            testID="adjust-canvas"
          />
        </ZoomView>
        {/* Over the photo: a note that comes and goes must not resize the canvas. */}
        <View pointerEvents="box-none" style={[styles.overlay, { padding: space.gutter, gap: space.xs }]}>
          {error ? <Banner tone="danger" message={error} testID="adjust-error" /> : null}
          <CanvasTrouble state={canvasState} onRetry={() => canvas.current?.retry()} />
        </View>
      </View>

      {!fixed ? (
        <View style={[styles.dock, { backgroundColor: colors.bg, paddingBottom: insets.bottom + space.sm }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.gutter }}>
            {allKeys.map((key) => {
              const on = key === wallKey;
              return (
                <Pressable
                  key={key}
                  onPress={() => switchTo(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.wallChip,
                    { borderRadius: radius.pill, borderColor: on ? colors.fg : colors.ruleStrong, backgroundColor: on ? colors.surfaceSoft : colors.surface },
                  ]}
                  testID={`adjust-wall-${key}`}
                >
                  <View style={[styles.dot, { backgroundColor: tintOf(key) }]} />
                  <Text variant="small" numberOfLines={1}>
                    {labelOf(key)}
                  </Text>
                </Pressable>
              );
            })}
            <Chip label={`+ ${t("adjust.newWall")}`} selected={false} onPress={() => setPicking(true)} testID="adjust-new-wall" />
          </ScrollView>

          {wallKey ? (
            <>
              <View style={[styles.row, { paddingHorizontal: space.gutter, gap: space.xs }]}>
                {(["brush", "eraser", "shape"] as const).map((k) => (
                  <Chip key={k} label={t(`adjust.${k}`)} selected={tool === k} onPress={() => setTool(k)} />
                ))}
                {canDelete ? <IconButton icon="trash-2" label={t("adjust.deleteWall")} onPress={() => setDeleting(true)} /> : null}
              </View>
              {tool === "shape" ? (
                <View style={[styles.row, styles.options, { paddingHorizontal: space.gutter, gap: space.xs, justifyContent: "space-between" }]}>
                  <Text variant="small" tone="soft" style={styles.fill}>
                    {corners.length === 1
                      ? t("adjust.oneCorner")
                      : corners.length
                        ? t("adjust.corners", { n: corners.length })
                        : t("adjust.shapeHint")}
                  </Text>
                  {corners.length ? <Button variant="ghost" block={false} label={t("adjust.clearCorners")} onPress={() => setCorners([])} /> : null}
                  <Button block={false} label={t("adjust.fill")} onPress={fill} disabled={corners.length < 3} />
                </View>
              ) : (
                <View style={[styles.row, styles.options, { paddingHorizontal: space.gutter, gap: space.xs }]}>
                  {(["small", "medium", "large"] as const).map((k) => (
                    <Chip key={k} label={t(`adjust.${k}`)} selected={size === k} onPress={() => setSize(k)} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text variant="small" tone="soft" style={{ paddingHorizontal: space.gutter }}>
              {t("adjust.noWalls")}
            </Text>
          )}
        </View>
      ) : null}

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("adjust.newWallTitle")}>
        <ListGroup>
          {NEW_WALL_KINDS.map((k) => (
            <ListRow key={k.category} title={t(k.label)} onPress={() => addWall(k.category, t(k.label))} />
          ))}
        </ListGroup>
      </Sheet>
      <ConfirmSheet
        visible={deleting}
        title={t("adjust.deleteTitle")}
        body={t("adjust.deleteBody")}
        confirmLabel={t("adjust.deleteWall")}
        destructive
        loading={removing.busy}
        onConfirm={removeWall}
        onCancel={() => setDeleting(false)}
      />
      <ConfirmSheet
        visible={Boolean(leaving)}
        title={t("adjust.discardTitle")}
        body={t("adjust.discardBody")}
        confirmLabel={t("adjust.discard")}
        destructive
        onConfirm={() => {
          if (leaving) setExit({ kind: "action", action: leaving });
          setLeaving(null);
        }}
        onCancel={() => setLeaving(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 2 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  dock: { paddingTop: 10, gap: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  // The brush sizes and the shape's buttons take the same height, so switching tool
  // doesn't resize the canvas (which would start the GPU over).
  options: { minHeight: 52 },
  wallChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
