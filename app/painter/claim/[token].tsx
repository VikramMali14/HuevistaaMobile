import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { isApiError, messageFor } from "@/api/errors";
import { rewardsApi, type RewardClaim, type RewardScan } from "@/api/endpoints/rewards";
import { claimChanges, keys } from "@/api/query-keys";
import { BackButton, Banner, Button, Card, CountUp, EmptyState, Screen, Skeleton, Text } from "@/components/ui";
import { claimLanded, points } from "@/features/painter/points";
import { rewardTokenFrom } from "@/features/painter/reward-token";
import { t } from "@/i18n";
import { announce } from "@/lib/announce";
import { formatServerDate } from "@/lib/dates";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * P6 · Claim a board. Spec: docs/05-screens-painter.md — P6. Web reference:
 * HueVistaaPainter components/app/claim-panel.tsx.
 *
 * What the board is worth to this painter (it reserves nothing), and Claim. A board that
 * can't pay says why in the server's own sentence — expired, claimed already (by anyone:
 * the server words both alike), not a bought room, not finished. Claimed: the points count
 * up, with the new balance, felt and said.
 *
 * Claiming has no request key: asked twice, the second is refused with the words used when
 * another painter won. So a claim that got no answer is never simply asked again — the
 * board and the wallet are read, and a board-scan credit of these points made since the ask
 * is this claim, landed.
 */
export default function ClaimBoard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { space } = useTheme();
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = rewardTokenFrom(typeof raw === "string" ? raw : "") ?? "";
  const scan = useQuery({
    queryKey: keys.boardScan(token),
    queryFn: () => rewardsApi.scan(token),
    enabled: Boolean(token),
    staleTime: 0,
    // A refusal is an answer: only a lost connection is worth asking again.
    retry: (failures, err) => !(isApiError(err) && err.kind === "http" && err.status < 500) && failures < 2,
  });
  const claiming = useSubmit();
  const [claimed, setClaimed] = useState<RewardClaim | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Claimed: felt as well as seen, and said (once).
  useEffect(() => {
    if (!claimed) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    announce(t("painter.claim.newBalance", { points: points(claimed.balance) }));
  }, [claimed]);

  const scanAnother = () => {
    const to = "/painter/scan" as Href;
    if (router.canDismiss()) router.dismissTo(to);
    else router.replace(to);
  };
  const done = () => {
    const to = "/painter" as Href;
    if (router.canDismiss()) router.dismissTo(to);
    else router.replace(to);
  };

  const claim = (board: RewardScan) =>
    void claiming.run(async () => {
      setClaimError(null);
      const askedAt = Date.now();
      try {
        const result = await rewardsApi.claim(token);
        setClaimed(result);
      } catch (err) {
        if (isApiError(err) && err.kind === "http" && err.status < 500) {
          // Refused: the board as it stands now says why (once — not again in a banner,
          // unless it still looks claimable, when the refusal's own sentence is the news).
          const now = await scan.refetch();
          if (!now.data || now.data.claimable) setClaimError(messageFor(err));
          return;
        }
        // No answer: did it land? Never asked again blind.
        try {
          const [wallet, now] = await Promise.all([
            queryClient.fetchQuery({ queryKey: keys.painterWallet, queryFn: rewardsApi.wallet, staleTime: 0 }),
            queryClient.fetchQuery({ queryKey: keys.boardScan(token), queryFn: () => rewardsApi.scan(token), staleTime: 0 }),
          ]);
          // A board that still reads as claimable hasn't paid this painter, whatever else
          // landed meanwhile (another board's points look the same in the statement).
          const landed = now.claimable ? null : claimLanded(wallet, board.points, askedAt);
          if (landed) {
            setClaimed({ projectId: board.projectId, role: "PAINTER", pointsAwarded: landed.points, balance: wallet.balance, claimedAt: landed.createdAt });
            return;
          }
          if (now.claimable) setClaimError(t("painter.claim.unanswered"));
        } catch {
          setClaimError(t("painter.claim.unansweredUnknown"));
        }
      } finally {
        for (const key of claimChanges) void queryClient.invalidateQueries({ queryKey: key }).catch(() => {});
      }
    });

  if (claimed) {
    return (
      <Screen
        footer={
          <View style={{ gap: space.xs }}>
            <Button label={t("painter.claim.scanAnother")} icon="maximize" onPress={scanAnother} testID="claim-scan-another" />
            <Button variant="secondary" label={t("painter.claim.seeWhatItBuys")} onPress={() => router.replace("/painter/rewards")} />
            <Button variant="ghost" label={t("painter.claim.done")} onPress={done} />
          </View>
        }
      >
        <View style={[styles.fill, styles.center, { gap: space.md }]} testID="claim-landed" accessibilityLiveRegion="polite">
          <Text variant="label" tone="accent">
            {t("painter.claim.landed")}
          </Text>
          <CountUp value={claimed.pointsAwarded} from={0} variant="display" tone="accent" format={(n) => `+${Math.round(n).toLocaleString("en-IN")}`} style={styles.big} />
          <Text variant="painterBody" tone="soft" align="center">
            {t("painter.claim.newBalance", { points: points(claimed.balance) })}
          </Text>
        </View>
      </Screen>
    );
  }

  if (!token) {
    return (
      <Screen>
        <BackButton fallback="/painter/scan" />
        <EmptyState icon="slash" title={t("painter.claim.badLink")} actionLabel={t("painter.claim.openScanner")} onAction={scanAnother} />
      </Screen>
    );
  }

  const board = scan.data;
  let body;
  let footer = null;
  if (scan.isPending) {
    body = (
      <View style={{ gap: space.sm }} testID="claim-loading">
        <Skeleton height={28} width="70%" />
        <Skeleton height={140} radius={16} />
      </View>
    );
  } else if (!board) {
    // "That code isn't one of ours." — or no connection, with Retry.
    const refused = isApiError(scan.error) && scan.error.kind === "http" && scan.error.status < 500;
    body = <Banner tone={refused ? "warning" : "danger"} message={messageFor(scan.error, t("painter.claim.readFailed"))} testID="claim-read-failed" />;
    footer = (
      <View style={{ gap: space.xs }}>
        {refused ? null : <Button label={t("common.retry")} onPress={() => void scan.refetch()} />}
        <Button variant={refused ? "primary" : "ghost"} label={t("painter.claim.scanAnother")} onPress={scanAnother} />
      </View>
    );
  } else {
    body = (
      <Card lit={board.claimable}>
        <View style={{ gap: space.sm }} testID="claim-preview">
          <Text variant="label" tone="accent">
            {t("painter.claim.eyebrow")}
          </Text>
          <Text variant="title2" accessibilityRole="header">
            {board.claimable ? t("painter.claim.worth", { points: points(board.points) }) : t("painter.claim.nothing")}
          </Text>
          <Text variant="painterBody" tone="soft" testID="claim-reason">
            {board.claimable ? t("painter.claim.worthBody") : (board.reason ?? "")}
          </Text>
          <View style={{ gap: space.xxs, marginTop: space.xs }}>
            <Fact label={t("painter.claim.painterHalf")} value={board.painterClaimed ? t("painter.claim.claimed") : t("painter.claim.unclaimed")} />
            <Fact label={t("painter.claim.shopHalf")} value={board.retailerClaimed ? t("painter.claim.claimed") : t("painter.claim.unclaimed")} />
            {board.expiresAt ? <Fact label={t("painter.claim.until")} value={formatServerDate(board.expiresAt)} /> : null}
          </View>
          {claimError ? <Banner tone="danger" message={claimError} testID="claim-error" /> : null}
        </View>
      </Card>
    );
    footer = board.claimable ? (
      <View style={{ gap: space.xs }}>
        <Button label={t("painter.claim.claim", { points: points(board.points) })} onPress={() => claim(board)} loading={claiming.busy} testID="claim-go" />
        <Button variant="ghost" label={t("painter.claim.notNow")} onPress={scanAnother} disabled={claiming.busy} />
      </View>
    ) : (
      <Button label={t("painter.claim.scanAnother")} icon="maximize" onPress={scanAnother} testID="claim-scan-another" />
    );
  }

  return (
    <Screen scroll footer={footer} contentStyle={{ gap: space.lg }}>
      <BackButton fallback="/painter/scan" />
      {body}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="small" tone="mute" style={styles.fill}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  big: { fontSize: 64, lineHeight: 72 },
  fact: { flexDirection: "row", alignItems: "center", minHeight: 28 },
});
