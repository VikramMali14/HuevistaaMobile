import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError, messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { RoomDetail, SegmentChoices } from "@/api/types";
import { AskForNotifications } from "@/features/notifications/AskForNotifications";
import {
  BackButton,
  Banner,
  Button,
  ErrorState,
  RemoteImage,
  Screen,
  Segmented,
  StepDots,
  Text,
  WorkingState,
} from "@/components/ui";
import { presentableFailure } from "@/features/studio/failure-message";
import { SLOW_AFTER_MS, useSegmentationPoll } from "@/features/studio/use-segmentation-poll";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

const DEFAULT_CHOICES: SegmentChoices = { maskMode: "AUTO", cleanFurnishing: "KEEP", cleanAngle: "AS_SHOT" };

/** What the room was last run with, so it can be started again as it was. */
function choicesOf(room: RoomDetail): SegmentChoices {
  return {
    maskMode: room.maskMode ?? DEFAULT_CHOICES.maskMode,
    cleanFurnishing: room.cleanFurnishing ?? DEFAULT_CHOICES.cleanFurnishing,
    cleanAngle: room.cleanAngle ?? DEFAULT_CHOICES.cleanAngle,
  };
}

/** When the server's job began, as best the room says: its last update. */
function startedAtOf(room: RoomDetail | undefined): number {
  const t0 = room?.updatedAt ? Date.parse(room.updatedAt.endsWith("Z") ? room.updatedAt : `${room.updatedAt}+05:30`) : NaN;
  return Number.isFinite(t0) && t0 <= Date.now() ? t0 : Date.now();
}

/**
 * C8 · Tidy up (steps 2 and 3, working). Spec: docs/04-screens-customer.md — C8.
 *
 * Three plain choices, then the server clears the clutter and finds the walls while this
 * screen polls and says what is happening. It can be left: the job carries on and the
 * room card says "Working…". Done → Walls found (or Adjust, to mark them by hand). Past
 * the deadline it can be started again: the server takes a restart once a run has gone
 * quiet for 5 minutes, and still counts it as one room.
 */
export default function TidyUp() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { colors, space } = useTheme();
  const params = useLocalSearchParams<{ projectId: string; shade?: string; brand?: string }>();
  const id = params.projectId ?? "";
  const room = useRoom(id);
  const [choices, setChoices] = useState<SegmentChoices>(DEFAULT_CHOICES);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The room has had all the runs it gets (429): said in the server's words, never retried.
  const [capped, setCapped] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const starting = useSubmit();

  const data = room.data;
  const working = data?.status === "SEGMENTING";
  const since = startedAt ?? startedAtOf(data);
  useSegmentationPoll(id, working, since);

  // Past the deadline the run is probably lost (the website gives up there); the poll
  // carries on in case it lands, but the screen stops promising "about a minute".
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [working]);
  const slow = working && now - since > SLOW_AFTER_MS;

  // Done: on to the walls — or to marking them, when there are none to show.
  useEffect(() => {
    if (data?.status !== "SEGMENTED") return;
    void queryClient.invalidateQueries({ queryKey: keys.projects, exact: true });
    const byHand = data.maskMode === "MANUAL" || data.autoMaskFailed || wallsWithMasks(data).length === 0;
    router.replace({
      pathname: byHand ? "/room/[projectId]/adjust" : "/room/[projectId]/walls",
      params: { projectId: id, shade: params.shade, brand: params.brand, ...(data.autoMaskFailed ? { notice: "auto" } : {}) },
    } as Href);
  }, [data, id, params.shade, params.brand, queryClient, router]);

  const start = (picked: SegmentChoices) =>
    void starting.run(async () => {
      setError(null);
      setCapped(false);
      setNotice(null);
      try {
        const next = await projectsApi.segment(id, picked);
        setStartedAt(Date.now());
        setRetrying(false);
        queryClient.setQueryData(keys.room(id), next);
      } catch (err) {
        if (isApiError(err) && err.status === 402 && err.code === "AUTO_MASK_UNAVAILABLE" && picked.maskMode === "AUTO") {
          // No automatic wall finding on this room: marking them is free. Any other 402 is
          // the room itself (closed, or nothing to bill) and marking by hand would be
          // refused the same way — so it is said as it is.
          setChoices({ ...picked, maskMode: "MANUAL" });
          setNotice(t("tidy.autoUnavailable"));
        } else if (isApiError(err) && err.status === 409) {
          // Already running (another device, a double tap, or a run the server still counts
          // as alive): watch it, with a fresh deadline.
          setStartedAt(Date.now());
          void room.refetch();
        } else {
          setCapped(isApiError(err) && err.code === "SEGMENTATION_RUN_LIMIT");
          setError(messageFor(err));
        }
      }
    });

  const leave = () => router.navigate("/studio");

  if (room.isError) {
    return (
      <Screen>
        <BackButton fallback="/studio" />
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      </Screen>
    );
  }
  if (!data || data.status === "SEGMENTED") {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]} testID="tidy-loading">
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  if (working) {
    const cleaned = Boolean(data.cleanedImageUrl);
    return (
      <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top }]}>
        <View style={{ paddingHorizontal: space.gutter, gap: space.sm }}>
          <BackButton fallback="/studio" />
          <StepDots current={cleaned ? "walls" : "tidy"} working />
        </View>
        <View style={[styles.fill, { margin: space.gutter }]}>
          <RemoteImage
            url={data.cleanedImageUrl || data.imageUrl}
            contentFit="contain"
            style={[styles.fill, { opacity: cleaned ? 1 : 0.55, backgroundColor: "transparent" }]}
            accessibilityLabel={data.name}
          />
        </View>
        <View style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.lg, gap: space.sm }}>
          <WorkingState
            stage={slow ? t("tidy.slowTitle") : cleaned ? t("tidy.stageWalls") : t("tidy.stageClean")}
            sentence={slow ? t("tidy.slowBody") : data.aiProgressNote?.trim() || (cleaned ? t("tidy.stageWallsBody") : t("tidy.stageCleanBody"))}
            estimate={slow ? undefined : cleaned ? t("tidy.estimateWalls") : t("tidy.estimateClean")}
            startedAt={since}
            onLeave={leave}
          />
          {slow ? (
            <>
              {error ? <Banner tone={capped ? "info" : "danger"} message={error} testID="tidy-error" /> : null}
              {capped ? null : (
                <Button label={t("tidy.startAgain")} onPress={() => start(choicesOf(data))} loading={starting.busy} testID="tidy-start-again" />
              )}
              <Button
                variant="secondary"
                label={t("tidy.slowReport")}
                onPress={() => router.push({ pathname: "/room/[projectId]/report", params: { projectId: id } } as Href)}
              />
            </>
          ) : null}
        </View>
      </View>
    );
  }

  if (data.status === "FAILED" && !retrying) {
    return (
      <Screen
        scroll
        contentStyle={{ gap: space.lg }}
        footer={
          <View style={{ gap: space.xs }}>
            <Button label={t("tidy.tryAgain")} onPress={() => setRetrying(true)} />
            <Button
              variant="secondary"
              label={t("tidy.markMyself")}
              onPress={() => start({ ...choices, maskMode: "MANUAL" })}
              loading={starting.busy}
            />
            <Button variant="ghost" label={t("tidy.getHelp")} onPress={() => router.push({ pathname: "/help", params: { draft: t("help.wallsDraft") } })} />
          </View>
        }
      >
        <BackButton fallback="/studio" />
        <StepDots current="tidy" />
        <RemoteImage url={data.imageUrl} style={[styles.photo, { borderRadius: 16 }]} accessibilityLabel={data.name} />
        <Text variant="title1" accessibilityRole="header">
          {t("tidy.failedTitle")}
        </Text>
        <Text variant="body" tone="soft" testID="tidy-failure">
          {presentableFailure(data.failureReason, data.failureStage)}
        </Text>
        {error ? <Banner tone="danger" message={error} /> : null}
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      contentStyle={{ gap: space.lg }}
      footer={<Button label={t("tidy.start")} onPress={() => start(choices)} loading={starting.busy} />}
    >
      <BackButton fallback="/studio" />
      <StepDots current="tidy" />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("tidy.title")}
        </Text>
        <Text variant="lead">{t("tidy.lead")}</Text>
      </View>
      <RemoteImage url={data.imageUrl} style={[styles.photo, { borderRadius: 16 }]} accessibilityLabel={data.name} />

      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("tidy.furniture")}
        </Text>
        <Segmented
          accessibilityLabel={t("tidy.furniture")}
          value={choices.cleanFurnishing}
          onChange={(cleanFurnishing) => setChoices((c) => ({ ...c, cleanFurnishing }))}
          options={[
            { value: "KEEP", label: t("tidy.keep") },
            { value: "EMPTY", label: t("tidy.empty") },
          ]}
        />
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("tidy.angle")}
        </Text>
        <Segmented
          accessibilityLabel={t("tidy.angle")}
          value={choices.cleanAngle}
          onChange={(cleanAngle) => setChoices((c) => ({ ...c, cleanAngle }))}
          options={[
            { value: "AS_SHOT", label: t("tidy.asShot") },
            { value: "BEST_VIEW", label: t("tidy.bestView") },
          ]}
        />
        {choices.cleanAngle === "BEST_VIEW" ? (
          <Text variant="small" tone="soft">
            {t("tidy.bestViewNote")}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("tidy.walls")}
        </Text>
        <Segmented
          accessibilityLabel={t("tidy.walls")}
          value={choices.maskMode}
          onChange={(maskMode) => {
            setChoices((c) => ({ ...c, maskMode }));
            setNotice(null);
          }}
          options={[
            { value: "AUTO", label: t("tidy.auto") },
            { value: "MANUAL", label: t("tidy.manual") },
          ]}
        />
      </View>
      {notice ? <Banner tone="info" message={notice} /> : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      <AskForNotifications reason="walls" when={working} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", aspectRatio: 4 / 3 },
});
