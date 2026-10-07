import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button, Card, CountUp, ErrorState, ListGroup, ListRow, Pill, Screen, Skeleton, Text } from "@/components/ui";
import { PainterHeader } from "@/features/painter/PainterHeader";
import { batchPill, figure, points, signedPoints } from "@/features/painter/points";
import { useWallet } from "@/features/painter/use-painter";
import { t } from "@/i18n";
import { daysUntil, formatServerDate, formatServerDateTime } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/**
 * P2 · Points. Spec: docs/05-screens-painter.md — P2. Web reference:
 * HueVistaaPainter app/(app)/(painter)/wallet/wallet-screen.tsx.
 *
 * The balance and what's been earned in all, rewards still on their way (→ P10), each batch
 * with the day it lapses (soonest first, warned when close), the latest movements, and
 * where points come from. Never a ₹ value: points aren't money.
 */
export default function PainterPoints() {
  const router = useRouter();
  const { space } = useTheme();
  const wallet = useWallet();
  const pull = usePullToRefresh(() => wallet.refetch());
  const w = wallet.data;

  let body;
  if (wallet.isPending) {
    body = (
      <View style={{ gap: space.md }} testID="points-loading">
        <Skeleton height={150} radius={16} />
        <Skeleton height={120} radius={16} />
      </View>
    );
  } else if (!w) {
    body = <ErrorState error={wallet.error} onRetry={() => void wallet.refetch()} />;
  } else {
    body = (
      <>
        <Card lit>
          <View style={[styles.row, { gap: space.lg }]} testID="points-balance">
            <View style={[styles.fill, { gap: space.xxs }]}>
              <Text variant="label" tone="accent">
                {t("painter.points.spendable")}
              </Text>
              <CountUp value={w.balance} variant="display" />
            </View>
            <View style={{ gap: space.xxs, alignItems: "flex-end" }}>
              <Text variant="label" tone="mute">
                {t("painter.points.lifetime")}
              </Text>
              <Text variant="title2">{figure(w.lifetimeEarned)}</Text>
            </View>
          </View>
          <View style={[styles.row, { gap: space.sm, marginTop: space.sm }]}>
            <View style={styles.fill}>
              <Button variant="secondary" label={t("painter.points.spend")} onPress={() => router.push("/painter/rewards")} />
            </View>
            <View style={styles.fill}>
              <Button variant="ghost" label={t("painter.points.earn")} onPress={() => router.push("/painter/scan")} />
            </View>
          </View>
        </Card>

        {w.pendingRedemptions > 0 ? (
          <ListGroup>
            <ListRow
              icon="truck"
              title={w.pendingRedemptions === 1 ? t("painter.points.pendingOne") : t("painter.points.pendingMany", { n: w.pendingRedemptions })}
              detail={t("painter.points.pendingBody")}
              onPress={() => router.push("/painter/vouchers")}
              testID="points-pending"
            />
          </ListGroup>
        ) : null}

        <View style={{ gap: space.sm }}>
          <Text variant="title3" accessibilityRole="header">
            {t("painter.points.batches")}
          </Text>
          {w.lots.length === 0 ? (
            <Text variant="painterBody" tone="soft">
              {t("painter.points.batchesEmpty")}
            </Text>
          ) : (
            <Card>
              <View style={{ gap: space.sm }} testID="points-batches">
                {w.lots.map((lot) => {
                  const days = daysUntil(lot.expiresAt);
                  const pill = batchPill(lot.expiresAt);
                  return (
                    <View key={lot.id} style={[styles.row, styles.center, { gap: space.sm }]} accessible accessibilityLabel={`${points(lot.pointsRemaining)}, ${formatServerDate(lot.expiresAt)}${pill ? `, ${pill}` : ""}`}>
                      <Text variant="painterStrong" style={styles.amount}>
                        {figure(lot.pointsRemaining)}
                      </Text>
                      <Text variant="small" tone="mute" style={styles.fill}>
                        {formatServerDate(lot.expiresAt)}
                      </Text>
                      {pill ? <Pill label={pill} tone={days !== null && days <= w.expiryWarningDays ? "warning" : "plain"} /> : null}
                    </View>
                  );
                })}
              </View>
            </Card>
          )}
          <Text variant="small" tone="mute">
            {t("painter.points.batchesNote", { days: w.validityDays })}
          </Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="title3" accessibilityRole="header">
            {t("painter.points.ledger")}
          </Text>
          {w.recentActivity.length === 0 ? (
            <Text variant="painterBody" tone="soft">
              {t("painter.points.ledgerEmpty")}
            </Text>
          ) : (
            <>
              <ListGroup>
                {w.recentActivity.map((row) => (
                  <ListRow key={row.id} title={row.label} detail={formatServerDateTime(row.createdAt)} value={signedPoints(row.points)} />
                ))}
              </ListGroup>
              {w.recentActivity.length >= 20 ? (
                <Text variant="small" tone="mute">
                  {t("painter.points.ledgerNote")}
                </Text>
              ) : null}
            </>
          )}
        </View>

        <ListGroup>
          <ListRow icon="gift" title={t("painter.points.vouchers")} onPress={() => router.push("/painter/vouchers")} testID="points-vouchers" />
        </ListGroup>

        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="title3">{t("painter.points.whereTitle")}</Text>
            <Text variant="body" tone="soft">
              {t("painter.points.whereBoards")}
            </Text>
            <Text variant="body" tone="soft">
              {t("painter.points.whereNotMoney")}
            </Text>
          </View>
        </Card>
      </>
    );
  }

  return (
    <Screen scroll edges={["top"]} onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.xl, paddingBottom: space.xl }}>
      <PainterHeader eyebrow={t("painter.points.eyebrow")} title={t("painter.points.title")} />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  center: { alignItems: "center" },
  fill: { flex: 1 },
  amount: { minWidth: 64, fontVariant: ["tabular-nums"] },
});
