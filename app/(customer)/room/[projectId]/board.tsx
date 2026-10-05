import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
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
  useToast,
  WorkingState,
} from "@/components/ui";
import {
  boardBlockedReason,
  boardClosesRoom,
  boardOption,
  boardsLeft,
  DEFAULT_OPTIONS_PER_BOARD,
  moved,
  pageCount,
  type BoardOption,
} from "@/features/boards/board-pages";
import { makeBoard } from "@/features/boards/make-board";
import { namesShown, shownName, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { RoomCanvas, type CanvasState, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import { removeCombo, reorderTray, useTray } from "@/features/studio/tray-store";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls, wallLabel } from "@/features/studio/wall-plan";
import { t } from "@/i18n";
import { codesAreUniversal } from "@/lib/shade-codes";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

type Step = { kind: "photo"; n: number; total: number } | { kind: "file" } | { kind: "charge" };

/**
 * C15 · Colour board — choose and confirm. Spec: docs/04-screens-customer.md — C15.
 *
 * The combinations saved on Paint, one page each, in the order they will print — shown on
 * the room as each is tapped, moved up or down, or taken off. Before the press, plainly:
 * how many options and pages, whether this is the room's only board, and that taking it
 * closes the room. Then the board is made in the money rule's order (make-board.ts).
 */
export default function ColourBoard() {
  const router = useRouter();
  const toast = useToast();
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
  const [step, setStep] = useState<Step | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const making = useSubmit();

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
  const max = Math.max(1, allowance.data?.imagesPerPdf ?? DEFAULT_OPTIONS_PER_BOARD);
  const index = Math.min(shown, Math.max(0, options.length - 1));

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
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]} testID="board-loading">
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  const blocked = boardBlockedReason(data);
  const over = usable.length - max;
  const left = boardsLeft(data);
  const closes = boardClosesRoom(data);
  const pages = pageCount(usable.length, data);
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

  const make = () => {
    setConfirming(false);
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
      } finally {
        setStep(null);
        setStartedAt(0);
      }
      if (outcome.status === "handed-over") {
        router.replace({ pathname: "/room/[projectId]/board-done", params: { projectId: id } } as Href);
        return;
      }
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

  const confirmLines = [
    usable.length === 1 ? t("board.confirmPagesOne", { pages }) : t("board.confirmPages", { options: usable.length, pages }),
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
        : t("board.file");

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
            accessibilityLabel={t("board.previewLabel", { n: index + 1 })}
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
        {!blocked && over > 0 ? (
          <Banner tone="warning" message={over === 1 ? t("board.tooManyOne", { max }) : t("board.tooMany", { max, n: over })} />
        ) : null}
        {canvas.kind === "noGl" && options.length ? <Banner tone="info" message={t("board.noLive")} /> : null}

        {options.map((option, i) => {
          const combo = tray[i]!;
          const on = i === index;
          return (
            <Card key={combo.savedAt} style={on ? { borderColor: colors.fg, borderTopColor: colors.fg } : undefined}>
              <Pressable
                onPress={() => setShown(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t("board.show", { n: i + 1 })}
                style={{ gap: space.xs }}
                testID={`board-option-${i + 1}`}
              >
                <Text variant="label" tone={on ? "accent" : "mute"}>
                  {t("board.option", { n: i + 1 })}
                </Text>
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
                <IconButton icon="arrow-up" label={t("board.moveUp", { n: i + 1 })} disabled={i === 0 || making.busy} onPress={() => {
                  reorderTray(id, moved(tray, i, i - 1));
                  setShown(i - 1);
                }} />
                <IconButton icon="arrow-down" label={t("board.moveDown", { n: i + 1 })} disabled={i === tray.length - 1 || making.busy} onPress={() => {
                  reorderTray(id, moved(tray, i, i + 1));
                  setShown(i + 1);
                }} />
                <View style={styles.fill} />
                <IconButton icon="trash-2" label={t("board.remove", { n: i + 1 })} disabled={making.busy} onPress={() => {
                  removeCombo(id, combo.savedAt);
                  setShown(Math.max(0, Math.min(index, tray.length - 2)));
                  toast.show(t("board.removed"), "info");
                }} testID={`board-remove-${i + 1}`} />
              </View>
            </Card>
          );
        })}

        {options.length && !blocked ? <Button variant="ghost" icon="plus" label={t("board.addMore")} onPress={toPaint} /> : null}
        {options.length && !blocked && left !== null ? (
          <Text variant="small" tone="mute" align="center">
            {left === 1 ? t("board.oneLeft", { max }) : t("board.boardsLeft", { n: left })}
          </Text>
        ) : null}
      </ScrollView>

      {options.length && !blocked ? (
        <View style={[styles.footer, { padding: space.gutter, paddingBottom: insets.bottom + space.sm, backgroundColor: colors.bg, borderTopColor: colors.rule }]}>
          <Button
            label={t("board.make")}
            icon="file-text"
            onPress={() => setConfirming(true)}
            disabled={usable.length === 0 || over > 0 || canvas.kind === "loading"}
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
      />

      {making.busy && startedAt > 0 ? (
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
