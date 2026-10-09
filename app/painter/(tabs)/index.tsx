import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { Banner, Button, Card, CountUp, ErrorState, ListGroup, ListRow, Screen, SectionHeader, Skeleton, Text } from "@/components/ui";
import { givenName } from "@/features/account/display-name";
import { PainterHeader, painterGreeting } from "@/features/painter/PainterHeader";
import { expirySentence, expiryWarning, nextReward, points, signedPoints } from "@/features/painter/points";
import { useCatalogue, usePainterProfile, useWallet } from "@/features/painter/use-painter";
import { t } from "@/i18n";
import { formatServerDateTime } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/**
 * P1 · Home. Spec: docs/05-screens-painter.md — P1. Web reference:
 * HueVistaaPainter app/(app)/(painter)/home/dashboard.tsx.
 *
 * The balance (counting up as it grows) with a warning when a batch is close to lapsing,
 * the one big Scan button, the next reward the points buy, whether customers nearby can
 * find this painter, and the latest movements.
 */
export default function PainterHome() {
  const router = useRouter();
  const { space } = useTheme();
  const { profile } = useSession();
  const wallet = useWallet();
  const catalogue = useCatalogue();
  const painter = usePainterProfile();
  const pull = usePullToRefresh(() => Promise.all([wallet.refetch(), catalogue.refetch(), painter.refetch()]));

  const w = wallet.data;
  const warning = expiryWarning(w);
  const reward = nextReward(catalogue.data);
  const recent = (w?.recentActivity ?? []).slice(0, 3);

  return (
    <Screen scroll edges={["top"]} onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.xl }}>
      <PainterHeader eyebrow={painterGreeting(givenName(profile))} title={t("painter.home.title")} />

      {wallet.isPending ? (
        <Card>
          <View style={{ gap: space.sm }} testID="painter-wallet-loading">
            <Skeleton width="30%" height={14} />
            <Skeleton width="55%" height={44} />
            <Skeleton width="70%" height={14} />
          </View>
        </Card>
      ) : !w ? (
        <Card>
          <View style={{ gap: space.xs }}>
            <Text variant="painterStrong">{t("painter.home.walletFailed")}</Text>
            <ErrorState error={wallet.error} onRetry={() => void wallet.refetch()} />
          </View>
        </Card>
      ) : (
        <Card lit>
          <View style={{ gap: space.sm }} testID="painter-balance">
            <Text variant="label" tone="accent">
              {t("painter.home.balance")}
            </Text>
            <CountUp value={w.balance} variant="display" />
            <Text variant="painterBody" tone="soft">
              {w.lifetimeEarned > 0 ? t("painter.home.earnedSince", { points: points(w.lifetimeEarned) }) : t("painter.home.startEarning")}
            </Text>
            {warning ? <Banner tone="warning" message={expirySentence(warning)} testID="painter-expiry" /> : null}
            <View style={[styles.row, { gap: space.sm }]}>
              <View style={styles.fill}>
                <Button
                  variant="secondary"
                  label={w.balance > 0 ? t("painter.home.spend") : t("painter.home.seeWhatTheyBuy")}
                  onPress={() => router.push("/painter/rewards")}
                />
              </View>
              <View style={styles.fill}>
                <Button variant="ghost" label={t("painter.home.statement")} onPress={() => router.push("/painter/points")} />
              </View>
            </View>
          </View>
        </Card>
      )}

      <View style={{ gap: space.sm }}>
        <Button label={t("painter.home.scan")} icon="maximize" onPress={() => router.push("/painter/scan")} testID="painter-scan" />
        <Button variant="ghost" label={t("painter.home.upload")} icon="file-text" onPress={() => router.push("/painter/upload-board")} />
      </View>

      {reward ? (
        <Card
          onPress={() => router.push({ pathname: "/painter/reward/[code]", params: { code: reward.code } })}
          accessibilityLabel={reward.affordable ? t("painter.home.rewardReady", { title: reward.title }) : t("painter.home.rewardToGo", { points: points(reward.pointsShort), title: reward.title })}
        >
          <View style={{ gap: space.xxs }} testID="painter-next-reward">
            <Text variant="label" tone="mute">
              {t("painter.home.rewardHint")}
            </Text>
            <Text variant="painterStrong">
              {reward.affordable ? t("painter.home.rewardReady", { title: reward.title }) : t("painter.home.rewardToGo", { points: points(reward.pointsShort), title: reward.title })}
            </Text>
          </View>
        </Card>
      ) : null}

      {painter.data ? (
        painter.data.listedForCustomers ? (
          <ListGroup>
            <ListRow icon="map-pin" title={t("painter.home.listed")} value={t("painter.home.listedOn")} onPress={() => router.push("/painter/nearby")} testID="painter-listed" />
          </ListGroup>
        ) : (
          <Card onPress={() => router.push("/painter/nearby")} accessibilityLabel={`${t("painter.home.nudgeTitle")}. ${t("painter.home.nudgeBody")}`}>
            <View style={{ gap: space.xxs }} testID="painter-nudge">
              <Text variant="painterStrong">{t("painter.home.nudgeTitle")}</Text>
              <Text variant="small" tone="soft">
                {t("painter.home.nudgeBody")}
              </Text>
              <Text variant="bodyStrong" tone="accent">
                {t("painter.home.nudgeAction")}
              </Text>
            </View>
          </Card>
        )
      ) : null}

      {w ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader title={t("painter.home.recent")} actionLabel={t("painter.home.everything")} onAction={() => router.push("/painter/points")} />
          {recent.length === 0 ? (
            <Text variant="painterBody" tone="soft">
              {t("painter.home.recentEmpty")}
            </Text>
          ) : (
            <ListGroup>
              {recent.map((row) => (
                <ListRow key={row.id} title={row.label} detail={formatServerDateTime(row.createdAt)} value={signedPoints(row.points)} />
              ))}
            </ListGroup>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  fill: { flex: 1 },
});
