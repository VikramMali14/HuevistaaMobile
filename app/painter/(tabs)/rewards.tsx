import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { RewardItem } from "@/api/endpoints/rewards";
import { BalanceChip, Banner, Button, Card, Chip, EmptyState, ErrorState, ListGroup, ListRow, Screen, Skeleton, Text } from "@/components/ui";
import { PainterHeader } from "@/features/painter/PainterHeader";
import { categoriesOf, categoryIcon, categoryLabel, figure, points, rewardStatus } from "@/features/painter/points";
import { useCatalogue, usePainterProfile, useWallet } from "@/features/painter/use-painter";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/**
 * P4 · Rewards. Spec: docs/05-screens-painter.md — P4. Web reference:
 * HueVistaaPainter app/(app)/(painter)/rewards/rewards-screen.tsx.
 *
 * The balance, the kinds of thing on offer, and every item — already priced against the
 * balance by the server: ready, how many points to go, a few left, or out of stock
 * (drained). A painter without a confirmed mobile is told before choosing: the team rings
 * it to deliver. Each item opens P9.
 */
export default function PainterRewards() {
  const router = useRouter();
  const { space } = useTheme();
  const catalogue = useCatalogue();
  const wallet = useWallet();
  const painter = usePainterProfile();
  const [kind, setKind] = useState<string | null>(null);
  const pull = usePullToRefresh(() => Promise.all([catalogue.refetch(), wallet.refetch(), painter.refetch()]));

  const items = catalogue.data ?? [];
  const kinds = categoriesOf(items);
  const shown = kind ? items.filter((i) => i.category === kind) : items;
  const noPhone = painter.data ? !(painter.data.phoneVerified && painter.data.phone) : false;

  let list;
  if (catalogue.isPending) {
    list = (
      <View style={{ gap: space.sm }} testID="rewards-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={110} radius={16} />
        ))}
      </View>
    );
  } else if (catalogue.isError && !catalogue.data) {
    list = <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />;
  } else if (items.length === 0) {
    list = <EmptyState icon="gift" title={t("painter.rewards.empty")} />;
  } else if (shown.length === 0) {
    list = (
      <Text variant="painterBody" tone="soft">
        {t("painter.rewards.groupEmpty")}
      </Text>
    );
  } else {
    list = (
      <View style={{ gap: space.sm }}>
        {shown.map((item) => (
          <RewardCard key={item.code} item={item} canRedeem={wallet.data?.canRedeem} onPress={() => router.push({ pathname: "/painter/reward/[code]", params: { code: item.code } })} />
        ))}
      </View>
    );
  }

  return (
    <Screen scroll edges={["top"]} onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <PainterHeader eyebrow={t("painter.rewards.eyebrow")} title={t("painter.rewards.title")} />
      <Text variant="painterBody" tone="soft">
        {t("painter.rewards.lead")}
      </Text>

      {wallet.data ? (
        <View style={styles.start}>
          <BalanceChip
            icon="star"
            label={`${t("painter.rewards.balance")}: ${points(wallet.data.balance)}`}
            onPress={() => router.push("/painter/points")}
            testID="rewards-balance"
          />
        </View>
      ) : null}

      {noPhone ? (
        <Banner tone="warning" message={t("painter.rewards.noPhone")} testID="rewards-no-phone">
          <Button variant="ghost" block={false} label={t("painter.rewards.addMobile")} onPress={() => router.push("/mobile-number")} />
        </Banner>
      ) : null}

      {kinds.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingVertical: 6 }} accessibilityLabel={t("painter.rewards.filter")}>
          <Chip label={t("painter.rewards.everything")} selected={kind === null} role="radio" onPress={() => setKind(null)} testID="rewards-kind-all" />
          {kinds.map((k) => (
            <Chip key={k} label={categoryLabel(k)} selected={kind === k} role="radio" onPress={() => setKind(k)} testID={`rewards-kind-${k}`} />
          ))}
        </ScrollView>
      ) : null}

      {list}

      <ListGroup>
        <ListRow icon="list" title={t("painter.rewards.redeemed")} onPress={() => router.push("/painter/vouchers")} testID="rewards-vouchers" />
      </ListGroup>
    </Screen>
  );
}

/** One catalogue item: what it is, its cost, and where this painter stands with it. */
function RewardCard({ item, canRedeem, onPress }: { item: RewardItem; canRedeem: boolean | undefined; onPress: () => void }) {
  const { colors, space } = useTheme();
  const status = rewardStatus(item, canRedeem);
  const ready = item.inStock && item.affordable && canRedeem !== false;
  return (
    <Card lit={ready} onPress={onPress} accessibilityLabel={`${item.title}, ${points(item.pointsCost)}, ${status.text}`}>
      <View style={[styles.row, { gap: space.md, opacity: item.inStock ? 1 : 0.55 }]} testID={`reward-${item.code}`}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}>
          <Feather name={categoryIcon(item.category)} size={22} color={colors.accentText} />
        </View>
        <View style={[styles.fill, { gap: 2 }]}>
          <Text variant="label" tone="mute">
            {categoryLabel(item.category)}
          </Text>
          <Text variant="painterStrong">{item.title}</Text>
          <Text variant="small" tone={status.tone}>
            {status.text}
          </Text>
        </View>
        <Text variant="title3" tone={ready ? "accent" : "mute"} style={styles.cost}>
          {figure(item.pointsCost)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  start: { alignItems: "flex-start" },
  fill: { flex: 1 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  cost: { fontVariant: ["tabular-nums"] },
});
