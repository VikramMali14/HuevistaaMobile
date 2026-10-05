import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { BalanceChip, Banner, Button, EmptyState, Screen, Text } from "@/components/ui";
import { useBalance } from "@/features/account/use-balance";
import { usePayment, verifyPayment, type PaymentState } from "@/features/payments/payments";
import { loadPending } from "@/features/payments/pending-payment";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** Tries again by itself while the screen is open: soon, then less often. */
const RETRY_AFTER_MS = [4_000, 10_000, 30_000];

function addedLine(state: Extract<PaymentState, { kind: "verified" }>): string | null {
  const parts: string[] = [];
  if (state.rooms > 0) parts.push(state.rooms === 1 ? t("checkout.oneRoom") : t("checkout.rooms", { n: state.rooms }));
  if (state.credits > 0) parts.push(state.credits === 1 ? t("checkout.oneCredit") : t("checkout.credits", { n: state.credits }));
  return parts.length ? t("payment.added", { what: parts.join(" + ") }) : null;
}

/**
 * C29 · Payment result. Spec: docs/04-screens-customer.md — C29.
 *
 * What the server said about the payment — never what the payment page said. Confirmed:
 * what was added, the new balance and the next step. Refused: the bank's reason and Try
 * again. Paid but not yet confirmed (no signal, a slow server): "We're checking your
 * payment", tried again by itself and on demand — never "failed" after a success, and never
 * a Pay button, because the money has already left.
 */
export default function PaymentResult() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const { profile } = useSession();
  const { order = "" } = useLocalSearchParams<{ order: string }>();
  const state = usePayment(order);
  const balance = useBalance();
  const checking = useSubmit();
  const tries = useRef(0);
  const [looked, setLooked] = useState(false);

  // Opened again after a restart: the proof kept on the phone is checked once more.
  useEffect(() => {
    if (state || !order) return;
    let live = true;
    void loadPending().then((pending) => {
      if (pending?.orderId === order && pending.paid && pending.accountId === profile?.id) {
        void verifyPayment(order, pending.paid.paymentId, pending.paid.signature);
      } else if (live) {
        setLooked(true);
      }
    });
    return () => {
      live = false;
    };
  }, [state, order, profile?.id]);

  // While checking, try again by itself a few times.
  const checkingState = state?.kind === "checking" ? state : null;
  useEffect(() => {
    if (!checkingState || tries.current >= RETRY_AFTER_MS.length) return;
    const wait = RETRY_AFTER_MS[tries.current]!;
    tries.current += 1;
    const timer = setTimeout(() => void verifyPayment(checkingState.orderId, checkingState.paymentId, checkingState.signature), wait);
    return () => clearTimeout(timer);
  }, [checkingState]);

  const home = () => router.replace("/home");

  if (!state || state.kind === "verifying") {
    const nothing = !state && (looked || !order);
    return (
      <Screen>
        <View style={[styles.fill, styles.center, { gap: space.md }]} accessibilityLiveRegion="polite" testID="payment-verifying">
          {nothing ? null : <ActivityIndicator color={colors.accentText} />}
          <Text variant="body" tone="soft">
            {nothing ? t("payment.nothing") : t("payment.verifying")}
          </Text>
          {nothing ? <Button variant="secondary" block={false} label={t("common.goHome")} onPress={home} /> : null}
        </View>
      </Screen>
    );
  }

  if (state.kind === "verified") {
    const added = addedLine(state);
    return (
      <Screen
        footer={
          <View style={{ gap: space.xs }}>
            {state.rooms > 0 ? (
              <Button label={t("payment.startRoom")} icon="camera" onPress={() => router.replace("/room/new")} testID="payment-start" />
            ) : (
              <Button label={t("payment.toBalance")} onPress={() => router.replace("/balance")} />
            )}
            <Button variant="ghost" label={t("common.goHome")} onPress={home} />
          </View>
        }
      >
        <View style={[styles.fill, { justifyContent: "center", gap: space.lg }]} testID="payment-paid">
          <Feather name="check-circle" size={40} color={colors.accentText} />
          <View style={{ gap: space.xs }}>
            <Text variant="display" accessibilityRole="header">
              {t("payment.paid")}
            </Text>
            <Text variant="lead">{added ?? t("payment.paidPlain")}</Text>
          </View>
          {balance.loaded ? (
            <View style={[styles.row, { gap: space.xs }]}>
              <BalanceChip
                icon="home"
                label={balance.rooms === 0 ? t("balance.noRooms") : balance.rooms === 1 ? t("balance.oneRoom") : t("balance.rooms", { n: balance.rooms })}
              />
              {balance.credits !== null ? (
                <BalanceChip icon="image" label={balance.credits === 1 ? t("balance.oneCredit") : t("balance.credits", { n: balance.credits })} />
              ) : null}
            </View>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (state.kind === "checking") {
    return (
      <Screen
        footer={
          <View style={{ gap: space.xs }}>
            <Button
              label={t("payment.checkAgain")}
              loading={checking.busy}
              onPress={() =>
                void checking.run(async () => {
                  await verifyPayment(state.orderId, state.paymentId, state.signature);
                })
              }
              testID="payment-check"
            />
            <Button variant="ghost" label={t("common.goHome")} onPress={home} />
          </View>
        }
      >
        <View style={[styles.fill, { justifyContent: "center", gap: space.md }]} testID="payment-checking">
          <Feather name="clock" size={40} color={colors.accentText} />
          <Text variant="title1" accessibilityRole="header">
            {t("payment.checkingTitle")}
          </Text>
          <Text variant="body" tone="soft">
            {t("payment.checkingBody")}
          </Text>
          <Text variant="small" tone="mute" selectable>
            {t("payment.reference", { id: state.paymentId })}
          </Text>
        </View>
      </Screen>
    );
  }

  const retry = () =>
    router.replace({
      pathname: "/checkout",
      params: state.basket ? { rooms: String(state.basket.rooms), credits: String(state.basket.credits) } : {},
    });

  if (state.kind === "cancelled") {
    return (
      <Screen>
        <EmptyState icon="x-circle" title={t("payment.cancelledTitle")} actionLabel={t("payment.backToBasket")} onAction={retry} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button label={t("payment.tryAgain")} onPress={retry} testID="payment-retry" />
          <Button variant="ghost" label={t("common.goHome")} onPress={home} />
        </View>
      }
    >
      <View style={[styles.fill, { justifyContent: "center", gap: space.md }]} testID="payment-failed">
        <Text variant="title1" accessibilityRole="header">
          {t("payment.failedTitle")}
        </Text>
        <Banner tone="danger" message={state.description || t("payment.failedPlain")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", flexWrap: "wrap" },
});
