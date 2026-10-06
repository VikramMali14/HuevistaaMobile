import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { RenderChoices } from "@/api/types";
import { BackButton, Banner, Button, Chip, EmptyState, ErrorState, Screen, Skeleton, Text, TextField } from "@/components/ui";
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
import { startRender } from "@/features/ai-images/start-render";
import { imageInProgress } from "@/features/boards/combos";
import { useRoom } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { formatRupees } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

const NOTE_MAX = 500;

type Params = { projectId?: string; comboId?: string } & Partial<Record<ChoiceKey, string>>;

/**
 * C23 · AI image — options. Spec: docs/04-screens-customer.md — C23.
 *
 * The option to photograph, then how: quality (the only choice that changes the price,
 * so first), which photo to paint from (only when the room has a cleaned one), time of
 * day, borders, light, furniture and look — the website's choices and words — and a note.
 * The cost is read from the wallet for the quality chosen, with the balance beside it;
 * short, the button buys what is missing (C28). Make my image spends the credits on the
 * server in that one request, so it is never sent twice (start-render.ts) and back is held
 * while it is under way. Arrives with the choices of an earlier image for Make another and
 * Try again.
 */
export default function AiImageOptions() {
  const router = useRouter();
  const { space } = useTheme();
  const params = useLocalSearchParams<Params>();
  const projectId = params.projectId ?? "";
  const comboId = params.comboId ?? "";
  const [choices, setChoices] = useState<RenderChoices>(() => choicesFrom(params));
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const making = useSubmit();

  const room = useRoom(projectId);
  const combos = useQuery({ queryKey: keys.combos(projectId), queryFn: () => projectsApi.combos(projectId), enabled: Boolean(projectId) });
  const renders = useQuery({ queryKey: keys.roomRenders(projectId), queryFn: () => projectsApi.renders(projectId), enabled: Boolean(projectId) });
  const wallet = useQuery({ queryKey: keys.aiCredits, queryFn: meApi.aiCredits });

  // Held while the image is being asked for (its credits are being spent); then on to C24.
  usePreventRemove(making.busy && !started, () => {});
  useEffect(() => {
    if (started) router.replace({ pathname: "/ai-image/[renderId]", params: { renderId: started, projectId } });
  }, [started, projectId, router]);

  const combo = combos.data?.find((c) => c.id === comboId) ?? null;
  const roomGone = isApiError(combos.error) && combos.error.kind === "http" && combos.error.status === 404;
  const outdoor = /^(OUTDOOR|EXTERIOR)$/i.test(room.data?.imageType ?? "");
  const hasCleaned = Boolean(room.data?.cleanedImageUrl);
  const inProgress = imageInProgress(renders.data);

  const chooseAnother = () => router.replace({ pathname: "/ai-image/new", params: projectId && !roomGone ? { projectId } : {} });

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
    setProblem(null);
    setChoices((c) => ({ ...c, [key]: value }));
  };

  const make = () =>
    void making.run(async () => {
      setProblem(null);
      setNoteError(null);
      const outcome = await startRender({ projectId, comboId, choices, note });
      if (outcome.kind === "started") {
        setStarted(outcome.render.id);
        return;
      }
      if (outcome.kind === "short") {
        setProblem(outcome.message);
        void wallet.refetch();
      } else if (outcome.kind === "optionGone") {
        setProblem(outcome.message);
        void combos.refetch();
      } else if (outcome.kind === "refused") {
        if (outcome.field === "note") setNoteError(outcome.message);
        else setProblem(outcome.message);
      } else {
        setProblem(t("aiImage.startUnknown"));
        void renders.refetch();
      }
    });

  const buy = () =>
    router.push({ pathname: "/checkout", params: { credits: String(Math.max(1, short)), from: "ai-image" } });

  let footer;
  if (wallet.isPending) {
    footer = (
      <View style={{ gap: space.xs }}>
        <Text variant="small" tone="mute" align="center">
          {t("aiImage.walletLoading")}
        </Text>
        <Button label={t("aiImage.make", { cost: creditWords(cost) })} icon="image" disabled onPress={() => {}} />
      </View>
    );
  } else if (!w) {
    // Not known is not zero: no sum is offered until the wallet has answered.
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
          disabled={making.busy}
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
          onPress={make}
          loading={making.busy}
          disabled={!combo}
          testID="ai-make"
        />
      </View>
    );
  }

  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: space.sm }}>
          {problem ? <Banner tone="danger" message={problem} testID="ai-problem" /> : null}
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
            <Button
              variant="ghost"
              block={false}
              label={t("aiImage.changeOption")}
              disabled={making.busy}
              onPress={() => (router.canGoBack() ? router.back() : chooseAnother())}
            />
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
            onPress={() => router.push({ pathname: "/ai-image/[renderId]", params: { renderId: inProgress.id, projectId } })}
          />
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
                const label =
                  row.key === "quality"
                    ? t("aiImage.qualityCost", { label: choiceLabel(value), cost: creditWords(costOf(w, value as RenderChoices["quality"])) })
                    : choiceLabel(value);
                return (
                  <Chip
                    key={value}
                    label={label}
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

    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});
