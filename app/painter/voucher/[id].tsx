import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { BackButton, Button, Card, EmptyState, ErrorState, Pill, Screen, Skeleton, Text } from "@/components/ui";
import { AskForNotifications } from "@/features/notifications/AskForNotifications";
import { points, redemptionStatus } from "@/features/painter/points";
import { displayPhone } from "@/features/painter/redeem";
import { usePainterProfile, useRedemptions } from "@/features/painter/use-painter";
import { VoucherCode } from "@/features/painter/VoucherCode";
import { t } from "@/i18n";
import { announce } from "@/lib/announce";
import { formatServerDate } from "@/lib/dates";
import { useTheme } from "@/theme";

/**
 * P11 · Voucher. Spec: docs/05-screens-painter.md — P11.
 *
 * The code drawn large enough to read at arm's length, the item, the day, how it stands and
 * what happens next. There's no read of one redemption on the server, so it comes from the
 * list (P9 puts a new one there before arriving with `fresh`, which says "Redeemed").
 */
export default function Voucher() {
  const router = useRouter();
  const { space } = useTheme();
  const { id = "", fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const redemptions = useRedemptions();
  const painter = usePainterProfile();
  const voucher = redemptions.data?.find((r) => r.id === id) ?? null;
  const justRedeemed = fresh === "1";

  useEffect(() => {
    if (!justRedeemed || !voucher) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    announce(`${t("painter.voucher.redeemed")}: ${voucher.itemTitle}`);
    // Once, on arrival — not again when the list is read afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justRedeemed, voucher?.id]);

  if (!voucher) {
    return (
      <Screen>
        <BackButton fallback="/painter/vouchers" />
        {redemptions.isPending ? (
          <View style={{ gap: space.sm, marginTop: space.lg }} testID="voucher-loading">
            <Skeleton height={28} width="60%" />
            <Skeleton height={120} radius={16} />
          </View>
        ) : redemptions.isError && !redemptions.data ? (
          <ErrorState error={redemptions.error} onRetry={() => void redemptions.refetch()} />
        ) : (
          <EmptyState icon="gift" title={t("painter.voucher.notFound")} actionLabel={t("painter.voucher.allVouchers")} onAction={() => router.replace("/painter/vouchers")} />
        )}
      </Screen>
    );
  }

  const phone = painter.data?.phoneVerified ? painter.data.phone : null;
  let next: string;
  if (voucher.status === "PENDING") next = phone ? t("painter.voucher.callYou", { phone: displayPhone(phone) }) : t("painter.voucher.callYouPlain");
  else if (voucher.status === "FULFILLED") next = t("painter.voucher.delivered", { date: formatServerDate(voucher.handledAt ?? voucher.requestedAt) });
  else if (voucher.rejectionReason?.trim()) next = t("painter.vouchers.refundedLine", { reason: voucher.rejectionReason.trim(), points: points(voucher.pointsSpent) });
  else next = t("painter.vouchers.refundedPlain", { points: points(voucher.pointsSpent) });

  return (
    <Screen
      scroll
      contentStyle={{ gap: space.lg }}
      footer={
        justRedeemed ? (
          <View style={{ gap: space.xs }}>
            <Button label={t("painter.voucher.allVouchers")} onPress={() => router.replace("/painter/vouchers")} />
            <Button variant="ghost" label={t("painter.voucher.catalogue")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/painter/rewards"))} />
          </View>
        ) : null
      }
    >
      <BackButton fallback="/painter/vouchers" />
      <View style={{ gap: space.xxs }}>
        <Text variant="label" tone="accent">
          {justRedeemed ? t("painter.voucher.redeemed") : t("painter.voucher.eyebrow")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {voucher.itemTitle}
        </Text>
      </View>
      <Card lit={voucher.status === "PENDING"}>
        <View style={{ gap: space.sm, alignItems: "center", paddingVertical: space.sm }} testID="voucher-card">
          <Text variant="label" tone="mute">
            {t("painter.voucher.code")}
          </Text>
          <VoucherCode code={voucher.voucherCode} />
          <Pill label={redemptionStatus(voucher.status)} tone={voucher.status === "PENDING" ? "warning" : voucher.status === "FULFILLED" ? "success" : "plain"} />
          <Text variant="small" tone="mute">
            {t("painter.vouchers.redeemedOn", { date: formatServerDate(voucher.requestedAt) })} · {t("painter.voucher.spent", { points: points(voucher.pointsSpent) })}
          </Text>
        </View>
      </Card>
      <Text variant="painterBody" tone="soft" testID="voucher-next">
        {next}
      </Text>
      <Text variant="small" tone="mute">
        {t("painter.voucher.copy")}
      </Text>
      <AskForNotifications reason="voucher" when={justRedeemed && voucher.status === "PENDING"} />
    </Screen>
  );
}
