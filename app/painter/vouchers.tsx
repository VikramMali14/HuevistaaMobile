import { useRouter } from "expo-router";
import { View } from "react-native";

import type { Redemption } from "@/api/endpoints/rewards";
import { BackButton, Card, EmptyState, ErrorState, ListGroup, ListRow, Pill, Screen, Skeleton, Text } from "@/components/ui";
import { points, redemptionStatus } from "@/features/painter/points";
import { useRedemptions } from "@/features/painter/use-painter";
import { VoucherCode } from "@/features/painter/VoucherCode";
import { t } from "@/i18n";
import { formatServerDate } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/**
 * P10 · My vouchers. Spec: docs/05-screens-painter.md — P10. Web reference:
 * HueVistaaPainter app/(app)/(painter)/rewards/collect/collect-screen.tsx.
 *
 * What's on its way first, each with its code drawn large (it's what the team asks for),
 * then what's settled: delivered, or refunded with the team's reason and the points that
 * went back. Each opens P11. The server's REJECTED is "Refunded" here: the points came back.
 */
export default function Vouchers() {
  const router = useRouter();
  const { space } = useTheme();
  const redemptions = useRedemptions();
  const pull = usePullToRefresh(() => redemptions.refetch());
  const list = redemptions.data ?? [];
  const pending = list.filter((r) => r.status === "PENDING");
  const settled = list.filter((r) => r.status !== "PENDING");
  const open = (r: Redemption) => router.push({ pathname: "/painter/voucher/[id]", params: { id: r.id } });

  let body;
  if (redemptions.isPending) {
    body = (
      <View style={{ gap: space.sm }} testID="vouchers-loading">
        <Skeleton height={150} radius={16} />
        <Skeleton height={64} radius={16} />
      </View>
    );
  } else if (redemptions.isError && !redemptions.data) {
    body = <ErrorState error={redemptions.error} onRetry={() => void redemptions.refetch()} />;
  } else if (list.length === 0) {
    body = <EmptyState icon="gift" title={t("painter.vouchers.empty")} actionLabel={t("painter.vouchers.openCatalogue")} onAction={() => router.replace("/painter/rewards")} />;
  } else {
    body = (
      <>
        {pending.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Text variant="title3" accessibilityRole="header">
              {t("painter.vouchers.onTheirWay")}
            </Text>
            {pending.map((r) => (
              <Card key={r.id} lit onPress={() => open(r)} accessibilityLabel={`${r.itemTitle}, ${redemptionStatus(r.status)}`}>
                <View style={{ gap: space.sm }} testID={`voucher-${r.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Text variant="painterStrong" style={{ flex: 1 }}>
                      {r.itemTitle}
                    </Text>
                    <Pill label={redemptionStatus(r.status)} tone="warning" />
                  </View>
                  <VoucherCode code={r.voucherCode} size="medium" />
                  <Text variant="small" tone="mute">
                    {t("painter.vouchers.redeemedOn", { date: formatServerDate(r.requestedAt) })} · {points(r.pointsSpent)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        ) : null}
        {settled.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Text variant="title3" accessibilityRole="header">
              {t("painter.vouchers.settled")}
            </Text>
            <ListGroup>
              {settled.map((r) => (
                <ListRow
                  key={r.id}
                  title={r.itemTitle}
                  detail={
                    r.status === "REJECTED"
                      ? r.rejectionReason?.trim()
                        ? t("painter.vouchers.refundedLine", { reason: r.rejectionReason.trim(), points: points(r.pointsSpent) })
                        : t("painter.vouchers.refundedPlain", { points: points(r.pointsSpent) })
                      : `${formatServerDate(r.handledAt ?? r.requestedAt)} · ${r.voucherCode}`
                  }
                  value={redemptionStatus(r.status)}
                  onPress={() => open(r)}
                  testID={`voucher-${r.id}`}
                />
              ))}
            </ListGroup>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Screen scroll onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/painter/rewards" />
      <View style={{ gap: space.xxs }}>
        <Text variant="label" tone="accent">
          {t("painter.vouchers.eyebrow")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {t("painter.vouchers.title")}
        </Text>
      </View>
      {body}
    </Screen>
  );
}
