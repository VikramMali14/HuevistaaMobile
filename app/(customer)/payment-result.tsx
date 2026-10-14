import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { Banner, Button, EmptyState, Screen, Text } from "@/components/ui";
import { usePayment, verifyPayment, type Basket } from "@/features/payments/payments";
import { loadPending, pendingIsFor } from "@/features/payments/pending-payment";
import { PlayResult } from "@/features/payments/play/PlayResult";
import { CheckingResult, PaidResult, RefusedResult, WaitingResult } from "@/features/payments/ResultBlocks";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** Tries again by itself while the screen is open: soon, then less often. */
const RETRY_AFTER_MS = [4_000, 10_000, 30_000];

/**
 * C29 · Payment result. Spec: docs/04-screens-customer.md — C29.
 *
 * What the server said about the payment — never what the payment page said. Confirmed:
 * what was added, the new balance and the next step. Refused by the bank: its reason and
 * Try again. Paid but not yet confirmed (no signal, a slow server): "We're checking your
 * payment", tried again by itself and on demand — never "failed" after a success, and never
 * a Pay button, because the money has already left. Refused by our server (it checked and
 * said no): its reason, the payment reference and Get help.
 *
 * `play` (a purchase token) instead of `order`: a Google Play purchase from the Android
 * store build, said by PlayResult in the same blocks (features/payments/ResultBlocks).
 */
export default function PaymentResult() {
  const { order = "", play, from } = useLocalSearchParams<{ order?: string; play?: string; from?: string }>();
  // Credits bought from C23's Buy: back to the image being chosen, under this screen.
  const forImage = from === "ai-image";
  // A Google Play purchase (the Android store build), by its purchase token.
  if (play) return <PlayResult token={play} forImage={forImage} />;
  return <RazorpayResult order={order} forImage={forImage} />;
}

function RazorpayResult({ order, forImage }: { order: string; forImage: boolean }) {
  const router = useRouter();
  const { space } = useTheme();
  const { profile } = useSession();
  const from = forImage ? "ai-image" : undefined;
  const state = usePayment(order);
  const checking = useSubmit();
  const tries = useRef(0);
  const [looked, setLooked] = useState(false);

  // Opened again after a restart: the proof kept on the phone is checked once more.
  useEffect(() => {
    if (state || !order) return;
    let live = true;
    void loadPending().then((pending) => {
      if (pending?.orderId === order && pending.paid && pendingIsFor(pending, profile?.id)) {
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

  // Back to the tabs that are already there, rather than a second copy of them.
  const goTo = (href: Href) => (router.canDismiss() ? router.dismissTo(href) : router.replace(href));
  const home = () => goTo("/home");
  const retry = (basket?: Basket) =>
    router.replace({
      pathname: "/checkout",
      params: {
        ...(basket ? { rooms: String(basket.rooms), credits: String(basket.credits) } : {}),
        ...(forImage ? { from } : {}),
      },
    });

  if (!state || state.kind === "verifying") {
    return <WaitingResult nothing={!state && (looked || !order)} onHome={home} />;
  }

  if (state.kind === "verified") {
    return <PaidResult rooms={state.rooms} credits={state.credits} forImage={forImage} onHome={home} />;
  }

  if (state.kind === "checking") {
    return (
      <CheckingResult
        reference={state.paymentId}
        busy={checking.busy}
        onCheck={() =>
          void checking.run(async () => {
            await verifyPayment(state.orderId, state.paymentId, state.signature);
          })
        }
        onHome={home}
      />
    );
  }

  if (state.kind === "refused") {
    return (
      <RefusedResult
        message={state.message}
        reference={state.paymentId}
        onHelp={() => router.push({ pathname: "/help", params: { draft: t("help.paymentDraft", { id: state.paymentId }) } })}
        onHome={home}
      />
    );
  }

  if (state.kind === "cancelled" || state.kind === "unfinished") {
    return (
      <Screen>
        <EmptyState
          icon="x-circle"
          title={state.kind === "cancelled" ? t("payment.cancelledTitle") : t("payment.unfinishedTitle")}
          body={state.kind === "unfinished" ? t("checkout.unfinished") : undefined}
          actionLabel={t("payment.backToBasket")}
          onAction={() => retry(state.basket)}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button label={t("payment.tryAgain")} onPress={() => retry(state.basket)} testID="payment-retry" />
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
});
