import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { rewardsApi, type Redemption } from "@/api/endpoints/rewards";
import { keys, redeemChanges } from "@/api/query-keys";
import { BackButton, Banner, Button, Card, ConfirmSheet, EmptyState, ErrorState, Screen, Skeleton, Text } from "@/components/ui";
import { categoryIcon, categoryLabel, points, rewardStatus } from "@/features/painter/points";
import { displayPhone, isUnanswered, RequestKey } from "@/features/painter/redeem";
import { useCatalogue, usePainterProfile, useWallet } from "@/features/painter/use-painter";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * P9 · Reward detail. Spec: docs/05-screens-painter.md — P9. Web reference:
 * HueVistaaPainter app/(app)/(painter)/rewards/redeem-sheet.tsx.
 *
 * What it is, what it costs and what's left, and Redeem — which says first who will ring,
 * what comes off the balance, and that only the team can give points back. Redeeming is one
 * request that spends the points; its key is kept for this item until a redemption comes
 * back, so pressing again after an answer that never came is the same redemption, never a
 * second (redeem.ts). Done: the voucher (P11).
 *
 * Held back, with the reason, when: there's no confirmed mobile (→ S4), the balance is
 * short, it's out of stock, or the account isn't a painter's.
 */
export default function RewardDetail() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, space } = useTheme();
  const { code = "" } = useLocalSearchParams<{ code: string }>();
  const catalogue = useCatalogue();
  const wallet = useWallet();
  const painter = usePainterProfile();
  const redeeming = useSubmit();
  const requestKey = useRef(new RequestKey()).current;
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = catalogue.data?.find((i) => i.code === code) ?? null;
  const phone = painter.data?.phoneVerified ? painter.data.phone : null;
  const phoneKnown = painter.isSuccess;

  if (catalogue.isPending) {
    return (
      <Screen>
        <BackButton fallback="/painter/rewards" />
        <View style={{ gap: space.sm, marginTop: space.lg }} testID="reward-loading">
          <Skeleton height={56} width={56} radius={28} />
          <Skeleton height={28} width="70%" />
          <Skeleton height={80} radius={16} />
        </View>
      </Screen>
    );
  }
  if (catalogue.isError && !catalogue.data) {
    return (
      <Screen>
        <BackButton fallback="/painter/rewards" />
        <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen>
        <BackButton fallback="/painter/rewards" />
        <EmptyState icon="gift" title={t("painter.reward.notFound")} actionLabel={t("painter.reward.back")} onAction={() => router.replace("/painter/rewards")} />
      </Screen>
    );
  }

  const status = rewardStatus(item, wallet.data?.canRedeem);
  // Only once the wallet and profile have answered: never offered on a guess.
  const canPress = item.inStock && item.affordable && wallet.data?.canRedeem === true && phoneKnown && Boolean(phone);

  const redeem = () =>
    void redeeming.run(async () => {
      setError(null);
      let done: Redemption | null = null;
      try {
        done = await rewardsApi.redeem(item.code, requestKey.current());
        requestKey.settled();
      } catch (err) {
        // No answer: it may have gone through. The same key, pressed again, can't spend twice.
        setError(isUnanswered(err) ? t("painter.reward.unanswered") : messageFor(err, t("painter.reward.failed")));
        // A refusal can mean the phone or the stock changed: read them again.
        void painter.refetch();
        void catalogue.refetch();
        return;
      } finally {
        for (const key of redeemChanges) void queryClient.invalidateQueries({ queryKey: key }).catch(() => {});
      }
      // The voucher reads from the list (there's no read of one): put it there first.
      queryClient.setQueryData<Redemption[]>(keys.painterRedemptions, (list) => [done!, ...(list ?? []).filter((r) => r.id !== done!.id)]);
      setConfirming(false);
      router.replace({ pathname: "/painter/voucher/[id]", params: { id: done.id, fresh: "1" } });
    });

  return (
    <Screen
      scroll
      contentStyle={{ gap: space.lg }}
      footer={
        <View style={{ gap: space.xs }}>
          {phoneKnown && !phone ? (
            <Banner tone="warning" message={t("painter.reward.noPhone")} testID="reward-no-phone">
              <Button variant="ghost" block={false} label={t("painter.rewards.addMobile")} onPress={() => router.push("/mobile-number")} />
            </Banner>
          ) : null}
          <Button
            label={canPress ? t("painter.reward.redeem", { points: points(item.pointsCost) }) : status.text}
            onPress={() => {
              setError(null);
              setConfirming(true);
            }}
            disabled={!canPress}
            testID="reward-redeem"
          />
        </View>
      }
    >
      <BackButton fallback="/painter/rewards" />
      <View style={{ gap: space.sm }}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}>
          <Feather name={categoryIcon(item.category)} size={28} color={colors.accentText} />
        </View>
        <Text variant="label" tone="mute">
          {categoryLabel(item.category)}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {item.title}
        </Text>
        {item.description ? (
          <Text variant="painterBody" tone="soft">
            {item.description}
          </Text>
        ) : null}
      </View>
      <Card lit={canPress}>
        <View style={{ gap: space.xs }} testID="reward-facts">
          <View style={styles.row}>
            <Text variant="painterBody" tone="soft" style={styles.fill}>
              {t("painter.reward.costs")}
            </Text>
            <Text variant="title3" tone="accent">
              {points(item.pointsCost)}
            </Text>
          </View>
          {item.stock != null ? (
            // No count is shown for a shelf with no limit: there's nothing to say about it.
            <View style={styles.row}>
              <Text variant="painterBody" tone="soft" style={styles.fill}>
                {t("painter.reward.stock")}
              </Text>
              <Text variant="painterStrong">{item.stock > 0 ? t("painter.reward.stockLeft", { n: item.stock }) : t("painter.rewards.outOfStock")}</Text>
            </View>
          ) : null}
          <Text variant="small" tone={status.tone}>
            {status.text}
          </Text>
        </View>
      </Card>
      {error && !confirming ? <Banner tone="danger" message={error} testID="reward-error" /> : null}

      <ConfirmSheet
        visible={confirming}
        title={t("painter.reward.confirmTitle", { title: item.title })}
        body={phone ? t("painter.reward.confirmCall", { phone: displayPhone(phone) }) : undefined}
        consequences={[t("painter.reward.confirmSpend", { points: points(item.pointsCost) }), t("painter.reward.confirmFinal")]}
        confirmLabel={t("painter.reward.redeem", { points: points(item.pointsCost) })}
        loading={redeeming.busy}
        error={error}
        onConfirm={redeem}
        onCancel={() => setConfirming(false)}
        testID="redeem-sheet"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  fill: { flex: 1 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
