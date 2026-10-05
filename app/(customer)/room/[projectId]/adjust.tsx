import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMemo, useRef, useState } from "react";
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

const NEW_WALL_KINDS: { category: RegionCategory; label: MessageKey }[] = [
  { category: "MAIN_WALL", label: "walls.categories.MAIN_WALL" },
  { category: "ACCENT_WALL", label: "walls.categories.ACCENT_WALL" },
  { category: "TRIM", label: "walls.categories.TRIM" },
  { category: "CEILING", label: "walls.categories.CEILING" },
  { category: "OTHER_WALL", label: "adjust.other" },
];

/**
 * C10 · Adjust walls (step 4). Spec: docs/04-screens-customer.md — C10.
 *
 * The photo full screen; one finger draws (Brush adds, Eraser removes, Shape fills the
 * corners tapped), two fingers zoom and move. Undo and Redo per wall. New wall picks what
 * it is first. Done saves every wall that changed — at the photo's own size, as the
 * backend wants — and goes on to Paint. A ready-made room's walls are fixed.
 */
export default function AdjustWalls() {
  const router = useRouter();
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
  const [ops, setOps] = useState<MaskOp[]>([]);
  const [redo, setRedo] = useState<MaskOp[]>([]);
  const [live, setLive] = useState<MaskOp | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [changed, setChanged] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useSubmit();
  const removing = useSubmit();

  const data = room.data;
  const found = useMemo(() => (data ? wallsWithMasks(data) : []), [data]);
  const fixed = Boolean(data?.fromLibrary);
  const allKeys = [...found.map((w) => String(w.id)), ...newWalls.map((w) => w.key)];
  const tintOf = (key: string) => WALL_TINTS[Math.max(0, allKeys.indexOf(key)) % WALL_TINTS.length]!;
  const wallKey = current ?? (found[0] ? String(found[0].id) : (newWalls[0]?.key ?? null));
  const dirty = changed.length > 0 || ops.length > 0;
  const photoSize = canvasState.kind === "ready" ? canvasState : null;

  const walls: CanvasWall[] = useMemo(() => {
    if (!data) return [];
    const loaded = canvasWalls(data, (r) => ({ hex: WALL_TINTS[found.indexOf(r) % WALL_TINTS.length]! }));
    return [
      ...loaded,
      ...newWalls.map((w, i) => ({ id: w.key, maskKey: w.key, manual: true, hex: WALL_TINTS[(found.length + i) % WALL_TINTS.length]! })),
    ];
  }, [data, found, newWalls]);

  const shown = live ? [...ops, live] : ops;
  const edit = wallKey && !fixed ? { wallId: wallKey, tint: tintOf(wallKey), ops: shown } : null;

  /** Move to another wall, keeping what was drawn on this one. */
  const switchTo = (key: string) => {
    if (key === wallKey) return;
    if (ops.length && wallKey) {
      canvas.current?.commitEdit();
      setChanged((c) => (c.includes(wallKey) ? c : [...c, wallKey]));
    }
    setOps([]);
    setRedo([]);
    setCorners([]);
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

  const fill = () => {
    if (corners.length < 3) return;
    setOps((o) => [...o, { kind: "shape", add: true, points: corners }]);
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

  const done = () => {
    if (fixed || !dirty) {
      router.replace({ pathname: "/room/[projectId]/paint", params: { projectId: id } } as Href);
      return;
    }
    void saving.run(async () => {
      setError(null);
      const todo = [...changed];
      if (ops.length && wallKey) {
        canvas.current?.commitEdit();
        if (!todo.includes(wallKey)) todo.push(wallKey);
      }
      setOps([]);
      setRedo([]);
      try {
        for (const key of todo) {
          const mask = canvas.current?.readWall(key);
          if (!mask) continue;
          const maskBase64 = toBase64(encodeMaskPng(coverageOf(mask.data, mask.width, mask.height), mask.width, mask.height));
          const added = newWalls.find((w) => w.key === key);
          if (added) await projectsApi.addWall(id, { maskBase64, label: added.label, category: added.category });
          else await projectsApi.replaceMask(id, Number(key), maskBase64);
          setChanged((c) => c.filter((k) => k !== key));
          if (added) setNewWalls((w) => w.filter((x) => x.key !== key));
        }
        await queryClient.invalidateQueries({ queryKey: keys.room(id) });
        void queryClient.invalidateQueries({ queryKey: keys.projects, exact: true });
        router.replace({ pathname: "/room/[projectId]/paint", params: { projectId: id } } as Href);
      } catch (err) {
        setChanged(todo);
        setError(t("adjust.saveFailed", { reason: messageFor(err) }));
      }
    });
  };

  const removeWall = () => {
    if (!wallKey) return;
    const added = newWalls.find((w) => w.key === wallKey);
    if (added) {
      setNewWalls((w) => w.filter((x) => x.key !== wallKey));
      setChanged((c) => c.filter((k) => k !== wallKey));
      setOps([]);
      setCurrent(null);
      setDeleting(false);
      return;
    }
    void removing.run(async () => {
      try {
        await projectsApi.removeWall(id, Number(wallKey));
        await queryClient.invalidateQueries({ queryKey: keys.room(id) });
        setOps([]);
        setCurrent(null);
        setDeleting(false);
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
        <IconButton
          icon="arrow-left"
          label={t("common.back")}
          onPress={() => (dirty ? setLeaving(true) : router.canGoBack() ? router.back() : router.replace("/studio"))}
        />
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
        {fixed ? <Banner tone="info" message={t("adjust.fixed")} /> : null}
        {notice ? <Banner tone="info" message={notice} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        {canvasState.kind === "noGl" ? <Banner tone="warning" message={t("paint.noGl")} /> : null}
      </View>

      <ZoomView resetKey={photo.key} style={{ marginTop: space.xs }}>
        <RoomCanvas
          ref={canvas}
          photo={photo.load}
          photoKey={photo.key}
          walls={walls}
          cleaned={Boolean(data.cleanedImageUrl)}
          edit={edit}
          onPointer={onPointer}
          onState={setCanvasState}
          testID="adjust-canvas"
        />
      </ZoomView>

      {!fixed ? (
        <View style={[styles.dock, { backgroundColor: colors.bg, paddingBottom: insets.bottom + space.sm }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.gutter }}>
            {allKeys.map((key) => {
              const f = found.find((w) => String(w.id) === key);
              const n = newWalls.find((w) => w.key === key);
              const label = f ? wallLabel(f) : (n?.label ?? "");
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
                    {label}
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
                <View style={[styles.row, { paddingHorizontal: space.gutter, gap: space.xs, justifyContent: "space-between" }]}>
                  <Text variant="small" tone="soft" style={styles.fill}>
                    {corners.length ? t("adjust.corners", { n: corners.length }) : t("adjust.shapeHint")}
                  </Text>
                  {corners.length ? <Button variant="ghost" block={false} label={t("adjust.clearCorners")} onPress={() => setCorners([])} /> : null}
                  <Button block={false} label={t("adjust.fill")} onPress={fill} disabled={corners.length < 3} />
                </View>
              ) : (
                <View style={[styles.row, { paddingHorizontal: space.gutter, gap: space.xs }]}>
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
        visible={leaving}
        title={t("adjust.discardTitle")}
        body={t("adjust.discardBody")}
        confirmLabel={t("adjust.discard")}
        destructive
        onConfirm={() => {
          setLeaving(false);
          if (router.canGoBack()) router.back();
          else router.replace("/studio");
        }}
        onCancel={() => setLeaving(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 2 },
  dock: { paddingTop: 10, gap: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  wallChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
