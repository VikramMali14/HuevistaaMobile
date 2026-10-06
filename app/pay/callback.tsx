import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { rememberRoute } from "@/auth/pending-route";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { Button, EmptyState, Screen, Text, useToast } from "@/components/ui";
import { parsePayCallback, type PayCallback } from "@/features/payments/pay-link";
import { checkoutInProgress, deliverPayAnswer, paymentState, settledRecently, settlePayment } from "@/features/payments/payments";
import { loadPending, markPaid, pendingIsFor } from "@/features/payments/pending-payment";
import { useOpeningUrl } from "@/features/payments/use-opening-url";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/** Keep a success's proof without a session (signed out, or the server unreachable). */
async function keepProof(callback: PayCallback) {
  if (callback.status !== "success") return;
  const pending = await loadPending();
  markPaid(
    callback.orderId,
    { paymentId: callback.paymentId, signature: callback.signature },
    pending?.orderId === callback.orderId ? pending.accountId : undefined,
  );
}

/**
 * D3 · Payment return. Spec: docs/06-screens-shared.md — D3.
 *
 * Usually the browser session waiting on C28 receives huevista://pay/callback#… and this
 * screen is its echo: it hands the answer over (on Android the session can end a moment
 * before the answer arrives) and steps aside. On a cold start — Android stopped the app
 * while the payment page was open — it reads the fragment (which routing does not see),
 * finds the order kept on the phone, settles it and shows C29. A success always settles,
 * whatever this run thought of the order before. Signed out or unreachable, the proof is
 * kept and confirmed once the account is back (C27 says so).
 */
export default function PaymentReturn() {
  const router = useRouter();
  const toast = useToast();
  const { colors, space } = useTheme();
  const { state } = useSession();
  const url = useOpeningUrl();
  const [nothing, setNothing] = useState(false);
  const started = useRef(false);

  const callback = useMemo(() => parsePayCallback(url), [url]);
  const signedIn = state.status === "signedIn" ? state.profile : null;

  useEffect(() => {
    if (started.current || state.status === "loading") return;
    const leave = (fallback: Href) => (router.canGoBack() ? router.back() : router.replace(fallback));
    if (state.status === "signedOut" || state.status === "unreachable") {
      started.current = true;
      void keepProof(callback);
      return;
    }
    if (!signedIn) return;
    started.current = true;
    if (signedIn.role !== "CUSTOMER") {
      router.replace(homeFor(signedIn) as Href);
      return;
    }
    // The app's own checkout is still waiting: the answer is its to settle.
    if (checkoutInProgress()) {
      deliverPayAnswer(callback);
      leave("/checkout");
      return;
    }
    // A cancel or failure just after the app's own session settled is its echo.
    if (callback.status !== "success" && settledRecently()) {
      leave("/checkout");
      return;
    }
    void (async () => {
      if (callback.status === "success") {
        const known = paymentState(callback.orderId);
        // Already shown by C28's own session (paid, or being confirmed): nothing new here.
        if (known && known.kind !== "cancelled" && known.kind !== "failed" && known.kind !== "unfinished" && router.canGoBack()) {
          router.back();
          return;
        }
      }
      const pending = await loadPending();
      const ours = pendingIsFor(pending, signedIn.id) ? pending : null;
      const settled = await settlePayment(callback, ours?.orderId ?? null, signedIn.id);
      if (!settled) {
        // An answer about nothing kept here (an old link, or one already settled).
        if (router.canGoBack()) router.back();
        else setNothing(true);
        return;
      }
      if (settled.kind === "cancelled") {
        toast.show(t("checkout.cancelled"), "info");
        router.replace({
          pathname: "/checkout",
          params: settled.basket ? { rooms: String(settled.basket.rooms), credits: String(settled.basket.credits) } : {},
        });
        return;
      }
      router.replace({ pathname: "/payment-result", params: { order: settled.orderId } });
    })();
  }, [state.status, signedIn, callback, router, toast]);

  if (state.status === "signedOut" || state.status === "unreachable") {
    const paid = callback.status === "success";
    const offline = state.status === "unreachable";
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
          <Text variant="title1" accessibilityRole="header">
            {offline ? t("payment.offlineTitle") : t("payment.signInTitle")}
          </Text>
          <Text variant="body" tone="soft">
            {paid
              ? offline
                ? t("payment.offlineBody")
                : t("payment.signInBody")
              : offline
                ? t("payment.offlineBodyPlain")
                : t("payment.signInBodyPlain")}
          </Text>
          <Button
            label={offline ? t("common.retry") : t("payment.signIn")}
            onPress={() => {
              if (offline) {
                router.replace("/");
                return;
              }
              rememberRoute("/balance");
              router.replace("/welcome");
            }}
          />
        </View>
      </Screen>
    );
  }
  if (nothing) {
    return (
      <Screen>
        <EmptyState icon="credit-card" title={t("payment.nothing")} actionLabel={t("common.goHome")} onAction={() => router.replace("/")} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, backgroundColor: colors.bg }} testID="pay-return">
      <ActivityIndicator color={colors.accentText} />
      <Text variant="body" tone="soft">
        {t("payment.verifying")}
      </Text>
    </View>
  );
}
