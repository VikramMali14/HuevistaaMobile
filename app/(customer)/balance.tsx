import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { AiCreditActivity } from "@/api/types";
import { useSession } from "@/auth/session";
import { BackButton, Banner, Button, Card, ErrorState, ListGroup, ListRow, Screen, Skeleton, Text, useToast } from "@/components/ui";
import { askedRecently, rememberAsked } from "@/features/account/asked-shop";
import { useBalance } from "@/features/account/use-balance";
import { verifyPayment } from "@/features/payments/payments";
import { usePaidButUnconfirmed } from "@/features/payments/pending-payment";
import { t, type MessageKey } from "@/i18n";
import { formatDate, toDate, validitySpan } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

const ACTIVITY = ["PURCHASED", "SPENT_ON_RENDER", "RENDER_REFUNDED", "GRANTED", "EXPIRED"];
/** Credits lapsing within this long are worth a warning colour; later ones are just a fact. */
const SOON_MS = 30 * 24 * 60 * 60_000;

function expiresSoon(iso: string): boolean {
  const at = toDate(iso);
  return at !== null && at.getTime() - Date.now() < SOON_MS;
}

/** A wallet movement in words: the server's note, else what kind it was. */
function activityLine(row: AiCreditActivity): string {
  if (row.note?.trim()) return row.note.trim();
  return t(`balanceScreen.activity.${ACTIVITY.includes(row.type) ? row.type : "other"}` as MessageKey);
}

/**
 * C27 · Rooms and credits. Spec: docs/04-screens-customer.md — C27.
 *
 * Two counters — rooms left, and AI credits — then how to get more: a shop's customer
 * whose rooms are used up asks the shop (who adds one free from the counter; they are never
 * sold a room), anyone else buys rooms; AI credits are bought by anyone who can hold them.
 * Then the AI credit statement. Worked out by the one balance hook (useBalance), so a
 * balance that won't load is "didn't load", never "0 rooms".
 */
export default function BalanceScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { colors, radius, space } = useTheme();
  const { profile } = useSession();
  const balance = useBalance();
  const wallet = useQuery({ queryKey: keys.aiCredits, queryFn: meApi.aiCredits });
  const shopCustomer = Boolean(balance.entitlement);
  const stuck = usePaidButUnconfirmed(profile?.id);
  const pull = usePullToRefresh(() => Promise.all([balance.refetch(), wallet.refetch()]));
  const [asked, setAsked] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const asking = useSubmit();
  const checking = useSubmit();

  // Asked within the day: say so, rather than email the shop again.
  const accountId = profile?.id;
  useEffect(() => {
    if (!accountId) return;
    let live = true;
    void askedRecently(accountId).then((yes) => live && yes && setAsked((was) => was ?? t("balanceScreen.askedToday")));
    return () => {
      live = false;
    };
  }, [accountId]);

  const ask = () =>
    void asking.run(async () => {
      setAskError(null);
      try {
        await meApi.requestMoreRooms();
        if (accountId) void rememberAsked(accountId);
        // The shop's name, to say who was asked (C31's list, read now if it isn't yet).
        const products = await queryClient
          .ensureQueryData({ queryKey: keys.assignedProducts, queryFn: meApi.assignedProducts })
          .catch(() => null);
        // The shop the server emails: the one whose rooms these are, else the newest code's.
        const own = balance.entitlement?.retailerOrgId;
        const shops = products?.shops ?? [];
        const shop = (shops.find((s) => own && s.shopId === own) ?? (own ? undefined : shops[0]))?.shopName?.trim();
        setAsked(shop ? t("balanceScreen.asked", { shop }) : t("balanceScreen.askedPlain"));
      } catch (err) {
        setAskError(messageFor(err));
      }
    });

  const checkNow = () => {
    const proof = stuck?.paid;
    if (!stuck || !proof) return;
    void checking.run(async () => {
      const state = await verifyPayment(stuck.orderId, proof.paymentId, proof.signature);
      if (state.kind === "verified") toast.show(t("checkout.confirmed"), "success");
      else if (state.kind === "checking") toast.show(t("checkout.stillChecking"), "info");
      else router.push({ pathname: "/payment-result", params: { order: state.orderId } });
    });
  };

  const w = wallet.data;
  const activity = w?.eligible ? (w.recentActivity ?? []).slice(0, 8) : [];

  let body;
  if (balance.loading) {
    body = (
      <View style={{ gap: space.md }} testID="balance-loading">
        <Skeleton height={150} radius={16} />
        <Skeleton height={130} radius={16} />
      </View>
    );
  } else if (!balance.loaded) {
    body = <ErrorState error={wallet.error} onRetry={() => void balance.refetch()} />;
  } else {
    const opts = balance.options;
    body = (
      <>
        <Card lit>
          <View style={{ gap: space.sm }}>
            {balance.roomsLoading ? (
              <Skeleton height={44} width={160} radius={10} />
            ) : balance.roomsKnown ? (
              <View style={styles.figure}>
                <Text variant="display" testID="balance-rooms-n">
                  {balance.rooms}
                </Text>
                <Text variant="body" tone="soft">
                  {balance.rooms === 1 ? t("balanceScreen.roomLeft") : t("balanceScreen.roomsLeft")}
                </Text>
              </View>
            ) : (
              // Never a count from half the answer: a failed source is not "0 rooms".
              <Banner tone="warning" message={t("balanceScreen.roomsFailed")} testID="balance-rooms-failed">
                <Button variant="ghost" block={false} label={t("common.retry")} onPress={() => void balance.refetch()} />
              </Banner>
            )}
            {opts?.validDays ? (
              <Text variant="small" tone="mute">
                {t("balanceScreen.roomsOpen", { span: validitySpan(opts.validDays) })}
              </Text>
            ) : null}
            {asked && balance.nextStep === "exhausted" ? <Banner tone="success" message={asked} testID="balance-asked" /> : null}
            {askError ? <Banner tone="danger" message={askError} /> : null}
            {balance.nextStep === "exhausted" && !asked ? (
              <Button label={t("balanceScreen.ask")} onPress={ask} loading={asking.busy} testID="balance-ask" />
            ) : null}
            {balance.nextStep !== null && balance.roomsKnown && !shopCustomer ? (
              <Button
                label={t("balanceScreen.buyRooms")}
                variant={balance.nextStep === "missing" ? "primary" : "secondary"}
                onPress={() => router.push({ pathname: "/checkout", params: { rooms: "1" } })}
                testID="balance-buy-rooms"
              />
            ) : null}
          </View>
        </Card>

        {balance.credits !== null ? (
          <Card>
            <View style={{ gap: space.sm }}>
              <View style={styles.figure}>
                <Text variant="display" testID="balance-credits-n">
                  {balance.credits}
                </Text>
                <Text variant="body" tone="soft">
                  {balance.credits === 1 ? t("balanceScreen.credit") : t("balanceScreen.credits")}
                </Text>
              </View>
              {w && w.pricePaise > 0 ? (
                <Text variant="small" tone="mute">
                  {w.listPricePaise > w.pricePaise
                    ? t("balanceScreen.creditPriceWas", { price: formatRupees(w.pricePaise), list: formatRupees(w.listPricePaise) })
                    : t("balanceScreen.creditPrice", { price: formatRupees(w.pricePaise) })}
                </Text>
              ) : null}
              {w?.expiringCredits && w.soonestExpiryAt ? (
                <Text variant="small" tone={expiresSoon(w.soonestExpiryAt) ? "warm" : "mute"}>
                  {w.expiringCredits === 1
                    ? t("balanceScreen.expiringOne", { date: formatDate(w.soonestExpiryAt) })
                    : t("balanceScreen.expiring", { n: w.expiringCredits, date: formatDate(w.soonestExpiryAt) })}
                </Text>
              ) : null}
              <Button
                variant="secondary"
                label={t("balanceScreen.buyCredits")}
                onPress={() => router.push({ pathname: "/checkout", params: { credits: "1" } })}
                testID="balance-buy-credits"
              />
            </View>
          </Card>
        ) : null}

        {/* Not on a linked profile, as on Account. */}
        {profile?.linkedProfile ? null : (
          <ListGroup>
            <ListRow icon="key" title={t("balanceScreen.addCode")} onPress={() => router.push("/add-shop-code")} />
          </ListGroup>
        )}

        {activity.length ? (
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="mute">
              {t("balanceScreen.statement")}
            </Text>
            <View style={[styles.statement, { borderColor: colors.rule, borderRadius: radius.md }]}>
              {activity.map((row, i) => (
                <View key={row.id} style={[styles.activity, i > 0 && { borderTopWidth: hairline, borderTopColor: colors.rule }]}>
                  <Text variant="bodyStrong" tone={row.credits < 0 ? "mute" : "accent"} style={styles.delta}>
                    {row.credits > 0 ? `+${row.credits}` : String(row.credits)}
                  </Text>
                  <View style={[styles.fill, { gap: 2 }]}>
                    <Text variant="small">{activityLine(row)}</Text>
                    {row.createdAt ? (
                      <Text variant="caption" tone="mute">
                        {formatDate(row.createdAt)}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="caption" tone="mute">
                    {t("balanceScreen.left", { n: row.balanceAfter })}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Screen scroll onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/account" />
      <Text variant="title1" accessibilityRole="header">
        {t("balanceScreen.title")}
      </Text>
      {stuck ? (
        <Banner
          tone="warning"
          message={stuck.amountPaise > 0 ? t("payment.pendingBanner", { amount: formatRupees(stuck.amountPaise) }) : t("payment.pendingBannerPlain")}
          testID="balance-pending"
        >
          <Button variant="ghost" block={false} label={t("checkout.checkNow")} onPress={checkNow} loading={checking.busy} />
        </Banner>
      ) : null}
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  figure: { flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  statement: { borderWidth: hairline, paddingHorizontal: 14 },
  activity: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  delta: { minWidth: 36 },
});
