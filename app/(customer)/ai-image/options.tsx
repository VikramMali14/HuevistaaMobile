import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { RenderChoices } from "@/api/types";
import {
  BackButton,
  Banner,
  Button,
  Chip,
  ConfirmSheet,
  Disclaimer,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  Text,
  TextField,
  useToast,
} from "@/components/ui";
import { ComboCard } from "@/features/ai-images/ComboCard";
import {
  CHOICE_ROWS,
  choiceHint,
  choiceLabel,
  choicesFrom,
  costOf,
  creditWords,
  rowLabel,
  type ChoiceKey,
} from "@/features/ai-images/render-options";
import { trackRender } from "@/features/ai-images/in-flight";
import { startRender, type StartOutcome } from "@/features/ai-images/start-render";
import { isBeingMade } from "@/features/ai-images/use-render";
import { imageInProgress } from "@/features/boards/combos";
import { useRoom } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { announce } from "@/lib/announce";
import { formatRupees } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

const NOTE_MAX = 500;
/** After an ask that went unanswered, the room's images are watched this long, this often. */
const WATCH_AFTER_UNKNOWN_MS = 3 * 60_000;
const WATCH_EVERY_MS = 5_000;

type Params = { projectId?: string; comboId?: string; note?: string } & Partial<Record<ChoiceKey, string>>;
/** `balance`: what the wallet said when "not enough credits" was answered. */
type Problem = { kind: StartOutcome["kind"]; message: string; balance?: number };

/**
 * C23 · AI image — options. Spec: docs/04-screens-customer.md — C23.
 *
 * The option to photograph, then how: quality (the only choice that changes the price,
 * so first), which photo to paint from (only when the room has a cleaned one), time of
 * day, borders, light, furniture and look — the website's choices and words — and a note.
 * The cost is read from the wallet for the quality chosen, with the balance beside it, and
 * only once the wallet has answered; short, the button buys what is missing (C28).
 *
 * Make my image spends the credits on the server in that one request, so it is never sent
 * twice (start-render.ts): back is held while it is out, with a line saying why; offline,
 * nothing is sent. An ask that went unanswered is watched for here — the room's images
 * are read again for a few minutes — and while it, or another image of this option, may
 * be being made, making one more asks first. Arrives with an earlier image's choices and
 * note for Make another and Try again.
 */
export default function AiImageOptions() {
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const { space } = useTheme();
  const params = useLocalSearchParams<Params>();
  const projectId = params.projectId ?? "";
  const comboId = params.comboId ?? "";
  const [choices, setChoices] = useState<RenderChoices>(() => choicesFrom(params));
  const [note, setNote] = useState(() => (typeof params.note === "string" ? params.note.slice(0, NOTE_MAX) : ""));
  const [noteError, setNoteError] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [watchUntil, setWatchUntil] = useState(0);
  const making = useSubmit();

  const room = useRoom(projectId);
  const combos = useQuery({ queryKey: keys.combos(projectId), queryFn: () => projectsApi.combos(projectId), enabled: Boolean(projectId) });
  const renders = useQuery({
    queryKey: keys.roomRenders(projectId),
    queryFn: () => projectsApi.renders(projectId),
    enabled: Boolean(projectId),
    // Watching for an ask that went unanswered to show up as being made.
    refetchInterval: () => (Date.now() < watchUntil ? WATCH_EVERY_MS : false),
  });
  const wallet = useQuery({ queryKey: keys.aiCredits, queryFn: meApi.aiCredits });

  // The wallet read again on coming back to this screen (from buying credits, or an image
  // that failed and handed them back) — never offered from what it said before.
  const focusedOnce = useRef(false);
  const refetchWallet = wallet.refetch;
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refetchWallet();
      focusedOnce.current = true;
    }, [refetchWallet]),
  );
  // "Not enough credits" stands until the balance it was said against goes up (credits bought).
  if (problem?.kind === "short" && wallet.data && wallet.data.balance > (problem.balance ?? Infinity)) setProblem(null);

  // Held while the image is being asked for (its credits are being spent); then on to C24.
  usePreventRemove(making.busy && !started, () => toast.show(t("aiImage.holdOn"), "info"));
  useEffect(() => {
    if (started) router.replace({ pathname: "/ai-image/[renderId]", params: { renderId: started, projectId } });
  }, [started, projectId, router]);

  const combo = combos.data?.find((c) => c.id === comboId) ?? null;
  const roomGone = isApiError(combos.error) && combos.error.kind === "http" && combos.error.status === 404;
  // The server's own rule: anything not known to be indoors is photographed as outdoors.
  const outdoor = Boolean(room.data) && room.data?.imageType !== "INDOOR";
  const hasCleaned = Boolean(room.data?.cleanedImageUrl);
  const inProgress = imageInProgress(renders.data);
  const sameInProgress = renders.data?.some((r) => r.comboId === comboId && isBeingMade(r)) ?? false;
  // Every image of the room seen being made is followed to its end (RenderWatcher), so the
  // shelf, the wallet and this banner catch up — one asked for elsewhere, or an unanswered
  // ask that turned up, included. Each was paid for when it was asked: the balance is read
  // again, never offered from before.
  const makingIds = renders.data?.filter(isBeingMade).map((r) => r.id).join(",") ?? "";
  useEffect(() => {
    if (!makingIds) return;
    for (const id of makingIds.split(",")) trackRender(projectId, id);
    void refetchWallet();
  }, [projectId, makingIds, refetchWallet]);
  // The unanswered ask has turned up, being made: the banner above points to it now.
  if (problem?.kind === "unknown" && sameInProgress) setProblem(null);
  // A second charge would be possible: this option is being made, or an ask may have started.
  const askFirst = sameInProgress || problem?.kind === "unknown";

  // Back to the room's options. When they are the screen underneath (C22 pushed this one),
  // go back to them, rather than stacking a second copy that Back would land on.
  const chooseAnother = () => {
    const state = navigation.getState();
    const below = state?.routes[state.index - 1];
    const belowRoom = (below?.params as { projectId?: string } | undefined)?.projectId;
    if (projectId && !roomGone && below?.name === "ai-image/new" && belowRoom === projectId) router.back();
    else router.replace({ pathname: "/ai-image/new", params: projectId && !roomGone ? { projectId } : {} });
  };

  if (!projectId || !comboId || roomGone || (combos.isSuccess && !combo)) {
    return (
      <Screen>
        <BackButton fallback="/ai-image/new" />
        <EmptyState
          icon="image"
          title={roomGone ? t("aiImage.roomGone") : t("aiImage.optionGone")}
          actionLabel={roomGone ? t("aiImage.seeRooms") : t("aiImage.chooseAnother")}
          onAction={chooseAnother}
        />
      </Screen>
    );
  }
  if (combos.isError && !combos.data) {
    return (
      <Screen>
        <BackButton fallback="/ai-image/new" />
        <ErrorState error={combos.error} onRetry={() => void combos.refetch()} />
      </Screen>
    );
  }

  const w = wallet.data;
  const cost = costOf(w, choices.quality);
  const balance = w?.eligible ? Math.max(0, w.balance) : null;
  const short = balance !== null ? Math.max(0, cost - balance) : 0;
  const pick = <K extends ChoiceKey>(key: K, value: RenderChoices[K]) => {
    if (problem?.kind !== "unknown") setProblem(null);
    setChoices((c) => ({ ...c, [key]: value }));
  };
  const tell = (next: Problem) => {
    setProblem(next);
    announce(next.message);
  };

  const make = () => {
    setConfirming(false);
    void making.run(async () => {
      setProblem(null);
      setNoteError(null);
      const outcome = await startRender({ projectId, comboId, choices, note });
      if (outcome.kind === "started") {
        setStarted(outcome.render.id);
        return;
      }
      if (outcome.kind === "short") {
        tell({ kind: "short", message: outcome.message });
        // The balance as the server has it now: the banner goes once it rises above that.
        void wallet.refetch().then((read) =>
          setProblem((p) => (p?.kind === "short" && read.data ? { ...p, balance: read.data.balance } : p)),
        );
      } else if (outcome.kind === "optionGone") {
        tell({ kind: "optionGone", message: outcome.message });
        void combos.refetch();
      } else if (outcome.kind === "refused") {
        if (outcome.field === "note") {
          setNoteError(outcome.message);
          announce(outcome.message);
        } else tell({ kind: "refused", message: outcome.message });
      } else if (outcome.kind === "offline") {
        tell({ kind: "offline", message: t("aiImage.offline") });
      } else {
        tell({ kind: "unknown", message: t("aiImage.startUnknown") });
        setWatchUntil(Date.now() + WATCH_AFTER_UNKNOWN_MS);
        void renders.refetch();
      }
    });
  };

  const buy = () =>
    router.push({ pathname: "/checkout", params: { credits: String(Math.max(1, short)), from: "ai-image" } });

  let footer;
  if (wallet.isPending) {
    footer = (
      <View style={{ gap: space.xs }}>
        <Text variant="small" tone="mute" align="center">
          {t("aiImage.walletLoading")}
        </Text>
        <Button label={t("aiImage.makePlain")} icon="image" disabled onPress={() => {}} />
      </View>
    );
  } else if (!w || (short > 0 && wallet.isError)) {
    // Not known is not zero: no sum is offered, and nothing bought, until the wallet answers.
    footer = (
      <Banner tone="warning" message={t("aiImage.walletFailed")} testID="ai-wallet-failed">
        <Button variant="ghost" block={false} label={t("common.retry")} onPress={() => void wallet.refetch()} />
      </Banner>
    );
  } else if (!w.eligible) {
    footer = <Banner tone="info" message={t("aiImage.notEligible")} testID="ai-not-eligible" />;
  } else if (short > 0) {
    footer = (
      <View style={{ gap: space.xs }}>
        <Text variant="small" tone="soft" align="center" testID="ai-cost">
          {short === 1
            ? t("aiImage.shortOne", { price: formatRupees(w.pricePaise) })
            : t("aiImage.short", { n: short, price: formatRupees(w.pricePaise) })}
        </Text>
        <Button
          label={t("aiImage.buy", { short: creditWords(short), total: formatRupees(w.pricePaise * short) })}
          icon="shopping-bag"
          onPress={buy}
          // A balance being read again may already be enough.
          disabled={making.busy || wallet.isFetching}
          testID="ai-buy"
        />
      </View>
    );
  } else {
    footer = (
      <View style={{ gap: space.xs }}>
        <Text variant="small" tone="soft" align="center" testID="ai-cost">
          {t("aiImage.costLine", { cost: creditWords(cost), balance: creditWords(balance ?? 0) })}
        </Text>
        <Button
          label={t("aiImage.make", { cost: creditWords(cost) })}
          icon="image"
          onPress={() => (askFirst ? setConfirming(true) : make())}
          loading={making.busy}
          disabled={!combo}
          testID="ai-make"
        />
        {making.busy ? (
          <Text variant="small" tone="mute" align="center" accessibilityLiveRegion="polite" testID="ai-asking">
            {t("aiImage.asking")}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: space.sm }}>
          {problem ? <Banner tone="danger" message={problem.message} testID="ai-problem" /> : null}
          {footer}
        </View>
      }
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
    >
      <BackButton fallback="/ai-image/new" />
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="accent">
          {room.data?.name?.trim() || t("aiImage.title")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {t("aiImage.optionsTitle")}
        </Text>
        <Text variant="body" tone="soft">
          {t("aiImage.optionsLead")}
        </Text>
      </View>

      {combo ? (
        <View style={{ gap: space.xs }}>
          <ComboCard combo={combo} testID="ai-chosen-option" />
          {(combos.data?.length ?? 0) > 1 ? (
            <Button variant="ghost" block={false} label={t("aiImage.changeOption")} disabled={making.busy} onPress={chooseAnother} />
          ) : null}
        </View>
      ) : (
        <Skeleton height={120} radius={16} />
      )}

      {inProgress ? (
        <Banner tone="info" message={t("aiImage.inFlight")} testID="ai-in-flight">
          <Button
            variant="ghost"
            block={false}
            label={t("aiImage.seeIt")}
            disabled={making.busy}
            onPress={() => router.push({ pathname: "/ai-image/[renderId]", params: { renderId: inProgress.id, projectId } })}
          />
        </Banner>
      ) : renders.isError && !renders.data ? (
        // Without the room's images, an image already being made can't be pointed to.
        <Banner tone="warning" message={t("aiImage.rendersFailed")} testID="ai-renders-failed">
          <Button variant="ghost" block={false} label={t("common.retry")} onPress={() => void renders.refetch()} />
        </Banner>
      ) : null}

      {CHOICE_ROWS.filter((row) => row.key !== "sourceImage" || hasCleaned).map((row) => {
        const chosen = choices[row.key];
        const hint = choiceHint(chosen, outdoor);
        return (
          <View key={row.key} style={{ gap: space.xs }} accessibilityRole="radiogroup" accessibilityLabel={rowLabel(row.key, outdoor)}>
            <Text variant="label" tone="mute">
              {rowLabel(row.key, outdoor)}
            </Text>
            <View style={[styles.wrap, { gap: space.xs }]}>
              {row.values.map((value) => {
                // A quality's price only from the wallet: none is shown before it answers.
                const label =
                  row.key === "quality" && w
                    ? t("aiImage.qualityCost", { label: choiceLabel(value), cost: creditWords(costOf(w, value as RenderChoices["quality"])) })
                    : choiceLabel(value);
                return (
                  <Chip
                    key={value}
                    label={label}
                    role="radio"
                    selected={chosen === value}
                    disabled={making.busy}
                    accessibilityHint={choiceHint(value, outdoor) ?? undefined}
                    onPress={() => pick(row.key, value as RenderChoices[typeof row.key])}
                    testID={`ai-choice-${value}`}
                  />
                );
              })}
            </View>
            {hint ? (
              <Text variant="small" tone="soft" accessibilityLiveRegion="polite">
                {hint}
              </Text>
            ) : null}
          </View>
        );
      })}

      <TextField
        label={t("aiImage.note")}
        placeholder={t("aiImage.notePlaceholder")}
        value={note}
        onChangeText={(text) => {
          setNoteError(null);
          setNote(text.slice(0, NOTE_MAX));
        }}
        maxLength={NOTE_MAX}
        multiline
        editable={!making.busy}
        hint={t("aiImage.noteCount", { n: note.length })}
        error={noteError}
        testID="ai-note"
      />

      <Disclaimer kind="shades" />

      <ConfirmSheet
        visible={confirming}
        title={t("aiImage.secondTitle")}
        body={t("aiImage.secondBody")}
        consequences={[t("aiImage.secondCost", { cost: creditWords(cost) })]}
        confirmLabel={t("aiImage.secondGo")}
        onConfirm={make}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});
