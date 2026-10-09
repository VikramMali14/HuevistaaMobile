import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { billingApi } from "@/api/endpoints/billing";
import { keys } from "@/api/query-keys";
import {
  BackButton,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  Text,
  WorkingState,
} from "@/components/ui";
import {
  boardBlockedReason,
  boardClosesRoom,
  boardOption,
  boardsLeft,
  DEFAULT_OPTIONS_PER_BOARD,
  MAX_WALLS_PER_PAGE,
  moved,
  pageCount,
  type BoardOption,
} from "@/features/boards/board-pages";
import { makeBoard, type BoardStep } from "@/features/boards/make-board";
import { namesShown, shownName, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { RoomCanvas, type CanvasState, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import { removeCombo, reorderTray, useTray, type SavedCombo } from "@/features/studio/tray-store";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls, wallLabel } from "@/features/studio/wall-plan";
import { t } from "@/i18n";
import { codesAreUniversal } from "@/lib/shade-codes";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

/**
 * C15 · Colour board — choose and confirm. Spec: docs/04-screens-customer.md — C15.
 *
 * The combinations saved on Paint, one page each, in the order they will print — shown on
 * the room as each is tapped, moved up or down, or taken off. Before the press, plainly:
 * how many options and pages, whether this is the room's only board, and that taking it
 * closes the room. Then the board is made in the money rule's order (make-board.ts) —
 * only once every wall's shape has loaded, so no picture leaves a painted wall out, and
 * with the way back held while it is made (leaving would photograph nothing).
 */
export default function ColourBoard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { colors, radius, space } = useTheme();
  const { projectId: id = "" } = useLocalSearchParams<{ projectId: string }>();
  const room = useRoom(id);
  const tray = useTray(id);
  const scheme = useShadeScheme();
  const catalogue = useCatalogue();
  const allowance = useQuery({ queryKey: keys.pdfAllowance, queryFn: billingApi.pdfAllowance, staleTime: 60 * 60_000 });
  const canvasRef = useRef<RoomCanvasHandle>(null);
  const [canvas, setCanvas] = useState<CanvasState>({ kind: "loading" });
  const [shown, setShown] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<BoardStep | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  // The option just taken off, to put back: the tray is the only place it is kept.
  const [removed, setRemoved] = useState<{ combo: SavedCombo; at: number } | null>(null);
  const making = useSubmit();

  // Held while the board is made; let go once it is handed over, and then on to C16 —
  // with the working state kept up until this screen has gone.
  usePreventRemove(making.busy && !handedOver, () => {});
  useEffect(() => {
    if (handedOver) router.replace({ pathname: "/room/[projectId]/board-done", params: { projectId: id } } as Href);
  }, [handedOver, id, router]);

  const data = room.data;
  const walls = useMemo(
    () => (data ? planWalls(wallsWithMasks(data)).map((w) => ({ id: String(w.id), label: wallLabel(w) })) : []),
    [data],
  );
  const nameOf = useCallback(
    (code: string | null) => {
      if (!code || !namesShown(scheme)) return null;
      const wanted = code.toUpperCase();
      const shade = catalogue.data?.shades.find((s) => (s.hvCode ?? "").toUpperCase() === wanted || s.code.toUpperCase() === wanted);
      return shade ? shownName(scheme, shade) : null;
    },
    [catalogue.data, scheme],
  );
  const options: BoardOption[] = useMemo(
    () => tray.map((combo) => boardOption(combo, walls, nameOf, namesShown(scheme))),
    [tray, walls, nameOf, scheme],
  );
  const usable = options.filter((o) => o.shades.length > 0);
  // Each option's number on the board: only the ones that print are counted.
  const numbers = useMemo(() => {
    let n = 0;
    return options.map((o) => (o.shades.length ? ++n : null));
  }, [options]);
  const max = Math.max(1, allowance.data?.imagesPerPdf ?? DEFAULT_OPTIONS_PER_BOARD);
  const index = Math.min(shown, Math.max(0, options.length - 1));

  if (room.isError && !data) {
    return (
      <Screen>
        <BackButton fallback="/studio" />
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top }]} testID="board-loading">
        <View style={[styles.top, { paddingHorizontal: space.xs }]}>
          <BackButton fallback="/studio" />
        </View>
        <View style={[styles.fill, styles.center]}>
          <ActivityIndicator color={colors.accentText} />
        </View>
      </View>
    );
  }

  const blocked = boardBlockedReason(data);
  const over = usable.length - max;
  const left = boardsLeft(data);
  const closes = boardClosesRoom(data);
  // The reward page closes every board of a customer's own room.
  const reward = pageCount(0, data) > 0;
  const crowded = options.findIndex((o) => o.shades.length > MAX_WALLS_PER_PAGE);
  const current = options[index] ?? null;
  const photo = roomPhoto(data);
  const shownWalls = canvasWalls(data, (r) => {
    const paint = current?.paints.get(String(r.id));
    return { hex: paint?.hex ?? null, lrv: paint?.lrv ?? null };
  });
  const toPaint = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/room/[projectId]/paint", params: { projectId: id } } as Href);
  };

  // Every wall's shape in, so each picture paints all of them (a phone with no live colour,
  // or a photo that didn't load, prints swatches — the confirm says so).
  const wallsLoading = canvas.kind === "loading" || (canvas.kind === "ready" && canvas.loading > 0);
  const make = () => {
    setConfirming(false);
    setRemoved(null);
    void making.run(async () => {
      setStartedAt(Date.now());
      setProblem(null);
      let outcome;
      try {
        outcome = await makeBoard({
          room: data,
          options: usable,
          snapshot: canvas.kind === "ready" ? (paints) => canvasRef.current?.snapshot(paints) ?? Promise.resolve(null) : null,
          universalCodes: codesAreUniversal(scheme),
          onStep: setStep,
        });
      } catch {
        outcome = { status: "build-failed" } as const;
      }
      if (outcome.status === "handed-over") {
        setHandedOver(true);
        return;
      }
      setStep(null);
      setStartedAt(0);
      if (outcome.status === "build-failed") {
        setProblem(t("board.buildFailed"));
        return;
      }
      // The server's own sentence, and the room read again: its idea of what is left is
      // newer than this screen's.
      setProblem(outcome.message);
      void queryClient.invalidateQueries({ queryKey: keys.room(id) });
    });
  };

  const unpainted = canvas.kind === "ready" ? canvas.missing : 0;
  const confirmLines = [
    usable.length === 1 ? t("board.confirmOption") : t("board.confirmOptions", { n: usable.length }),
    ...(reward ? [t("board.confirmReward")] : []),
    ...(canvas.kind === "noGl" ? [t("board.confirmNoLive")] : []),
    ...(canvas.kind === "failed" ? [t("board.confirmSwatches")] : []),
    ...(unpainted === 1 ? [t("board.confirmUnpaintedOne")] : unpainted > 1 ? [t("board.confirmUnpainted", { n: unpainted })] : []),
    ...(left === 1
      ? [(data.boardsAllowed ?? 0) <= 1 ? t("board.confirmOnly") : t("board.confirmLast", { used: data.boardsUsed ?? 0, allowed: data.boardsAllowed ?? 0 })]
      : left !== null
        ? [t("board.confirmMore", { n: left })]
        : []),
    ...(closes ? [t("board.confirmCloses")] : []),
    t("board.confirmAi"),
  ];

  const stepLine =
    step?.kind === "photo"
      ? t("board.photo", { n: step.n, total: step.total })
      : step?.kind === "charge"
        ? t("board.charge")
        : step?.kind === "file"
          ? t("board.file")
          : t("board.starting");
  const shownNumber = numbers[index] ?? null;

  return (
    <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top }]}>
      <View style={[styles.top, { paddingHorizontal: space.xs }]}>
        <BackButton fallback="/studio" />
        <Text variant="bodyStrong" style={styles.fill} accessibilityRole="header">
          {t("board.title")}
        </Text>
      </View>

      {options.length ? (
        <View style={styles.preview}>
          <RoomCanvas
            ref={canvasRef}
            photo={photo.load}
            photoKey={photo.key}
            walls={shownWalls}
            cleaned={Boolean(data.cleanedImageUrl)}
            onState={setCanvas}
            accessibilityLabel={shownNumber ? t("board.previewLabel", { n: shownNumber }) : t("board.previewUnprinted")}
            testID="board-canvas"
          />
          <View pointerEvents="box-none" style={[styles.overlay, { padding: space.gutter }]}>
            <CanvasTrouble state={canvas} onRetry={() => canvasRef.current?.retry()} />
          </View>
        </View>
      ) : null}

      <ScrollView
        style={[styles.fill, { backgroundColor: colors.bg }]}
        contentContainerStyle={{ padding: space.gutter, gap: space.md, paddingBottom: space.xl }}
      >
        {options.length === 0 ? (
          <EmptyState
            icon="layers"
            title={t("board.emptyTitle")}
            body={blocked ?? t("board.emptyBody")}
            actionLabel={blocked ? undefined : t("board.backToPaint")}
            onAction={blocked ? undefined : toPaint}
          />
        ) : (
          <Text variant="body" tone="soft">
            {t("board.lead")}
          </Text>
        )}
        {blocked && options.length ? <Banner tone="info" message={blocked} testID="board-blocked" /> : null}
        {blocked && data.closedAt ? (
          <Button variant="secondary" label={t("board.seeBoard")} onPress={() => router.replace({ pathname: "/board/[projectId]", params: { projectId: id } } as Href)} />
        ) : null}
        {problem ? <Banner tone="danger" message={problem} testID="board-problem" /> : null}
        {removed ? (
          <Banner tone="info" message={t("board.removed")} testID="board-removed">
            <Button
              variant="ghost"
              block={false}
              label={t("board.undo")}
              disabled={making.busy}
              onPress={() => {
                const { combo, at } = removed;
                setRemoved(null);
                if (tray.some((c) => c.savedAt === combo.savedAt)) return;
                reorderTray(id, [...tray.slice(0, at), combo, ...tray.slice(at)]);
                setShown(Math.min(at, tray.length));
              }}
              testID="board-undo"
            />
          </Banner>
        ) : null}
        {!blocked && over > 0 ? (
          <Banner tone="warning" message={over === 1 ? t("board.tooManyOne", { max }) : t("board.tooMany", { max, n: over })} />
        ) : null}
        {!blocked && crowded >= 0 ? (
          <Banner tone="warning" message={t("board.crowded", { max: MAX_WALLS_PER_PAGE, n: numbers[crowded] ?? crowded + 1 })} testID="board-crowded" />
        ) : null}
        {canvas.kind === "noGl" && options.length ? <Banner tone="info" message={t("board.noLive")} /> : null}

        {options.map((option, i) => {
          const combo = tray[i]!;
          const on = i === index;
          const n = numbers[i] ?? null;
          const said = option.shades.map((s) => [s.label, s.name, s.code].filter(Boolean).join(" ")).join(", ");
          return (
            <Card key={combo.savedAt} style={on ? { borderColor: colors.fg, borderTopColor: colors.fg } : undefined}>
              <Pressable
                onPress={() => setShown(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={n ? t("board.show", { n, shades: said }) : t("board.showUnprinted")}
                style={{ gap: space.xs }}
                testID={`board-option-${i + 1}`}
              >
                <Text variant="label" tone={on ? "accent" : "mute"}>
                  {n ? t("board.option", { n }) : t("board.unprinted")}
                </Text>
                {option.shades.length > MAX_WALLS_PER_PAGE ? (
                  <Text variant="small" tone="danger">
                    {t("board.crowdedOption", { max: MAX_WALLS_PER_PAGE })}
                  </Text>
                ) : null}
                {option.shades.length === 0 ? (
                  <Text variant="small" tone="mute">
                    {t("board.noWalls")}
                  </Text>
                ) : (
                  option.shades.map((shade) => (
                    <View key={`${shade.regionId}`} style={styles.shade}>
                      <View style={[styles.chip, { backgroundColor: shade.hex, borderColor: colors.ruleStrong, borderRadius: radius.xs }]} />
                      <Text variant="small" style={styles.fill} numberOfLines={1}>
                        {shade.label}
                        {shade.name ? ` · ${shade.name}` : ""}
                      </Text>
                      {shade.code ? (
                        <Text variant="bodyStrong" tone="soft">
                          {shade.code}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </Pressable>
              <View style={[styles.controls, { borderTopColor: colors.rule }]}>
                {n ? (
                  <>
                    <IconButton icon="arrow-up" label={t("board.moveUp", { n })} disabled={i === 0 || making.busy} onPress={() => {
                      reorderTray(id, moved(tray, i, i - 1));
                      setShown(i - 1);
                    }} />
                    <IconButton icon="arrow-down" label={t("board.moveDown", { n })} disabled={i === tray.length - 1 || making.busy} onPress={() => {
                      reorderTray(id, moved(tray, i, i + 1));
                      setShown(i + 1);
                    }} />
                  </>
                ) : null}
                <View style={styles.fill} />
                <IconButton icon="trash-2" label={n ? t("board.remove", { n }) : t("board.removeUnprinted")} disabled={making.busy} onPress={() => {
                  removeCombo(id, combo.savedAt);
                  setRemoved({ combo, at: i });
                  // The same option stays in view: those after it move up one.
                  setShown(i < index ? index - 1 : Math.max(0, Math.min(index, tray.length - 2)));
                }} testID={`board-remove-${i + 1}`} />
              </View>
            </Card>
          );
        })}

        {options.length && !blocked ? <Button variant="ghost" icon="plus" label={t("board.addMore")} onPress={toPaint} /> : null}
        {options.length && !blocked && left !== null ? (
          <Text variant="small" tone="mute" align="center">
            {left === 1
              ? (data.boardsAllowed ?? 0) <= 1
                ? t("board.onlyOne", { max })
                : t("board.lastOne", { max })
              : t("board.boardsLeft", { n: left })}
          </Text>
        ) : null}
      </ScrollView>

      {options.length && !blocked ? (
        <View style={[styles.footer, { padding: space.gutter, paddingBottom: insets.bottom + space.sm, backgroundColor: colors.bg, borderTopColor: colors.rule }]}>
          <Button
            label={t("board.make")}
            icon="file-text"
            onPress={() => setConfirming(true)}
            disabled={usable.length === 0 || over > 0 || crowded >= 0 || wallsLoading}
            loading={making.busy}
            testID="board-make"
          />
        </View>
      ) : null}

      <ConfirmSheet
        visible={confirming}
        title={t("board.confirmTitle")}
        consequences={confirmLines}
        confirmLabel={t("board.confirmGo")}
        onConfirm={make}
        onCancel={() => setConfirming(false)}
        testID="board-confirm"
      />

      {startedAt > 0 ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: `${colors.bg}f2`, padding: space.gutter }]} testID="board-working">
          <WorkingState stage={t("board.working")} sentence={stepLine} startedAt={startedAt} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 4 },
  preview: { height: "38%" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  shade: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  chip: { width: 28, height: 20, borderWidth: hairline },
  controls: { flexDirection: "row", alignItems: "center", marginTop: 8, paddingTop: 4, borderTopWidth: hairline, marginHorizontal: -8 },
  footer: { borderTopWidth: hairline },
});
