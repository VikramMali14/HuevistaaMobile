import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { rememberRoute } from "@/auth/pending-route";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { Button, EmptyState, Screen, Text, useToast } from "@/components/ui";
import { parsePayCallback } from "@/features/payments/pay-link";
import { checkoutInProgress, paymentState, settlePayment } from "@/features/payments/payments";
import { loadPending, markPaid } from "@/features/payments/pending-payment";
import { useOpeningUrl } from "@/features/payments/use-opening-url";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * D3 · Payment return. Spec: docs/06-screens-shared.md — D3.
 *
 * Normally the browser session waiting on C28 receives huevista://pay/callback#… and this
 * screen is only its echo: it steps aside and C28 shows the result. On a cold start —
 * Android stopped the app while the payment page was open — this reads the fragment (which
 * routing does not see), finds the order kept on the phone, settles it and shows C29. A
 * payment that came back while signed out is kept with its proof, and confirmed after
 * sign-in (C27 says so).
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
    if (started.current || state.status === "loading" || state.status === "unreachable") return;
    if (state.status === "signedOut") {
      started.current = true;
      // Keep the proof: it is confirmed once this account is back (C27, C29).
      if (callback.status === "success") {
        void loadPending().then(() => markPaid(callback.orderId, { paymentId: callback.paymentId, signature: callback.signature }));
      }
      return;
    }
    if (!signedIn) return;
    started.current = true;
    if (signedIn.role !== "CUSTOMER") {
      router.replace(homeFor(signedIn) as Href);
      return;
    }
    const echoOf = callback.status === "success" ? callback.orderId : null;
    // The browser session on C28 has (or will have) this answer itself.
    if (checkoutInProgress() || (echoOf && paymentState(echoOf))) {
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: "/payment-result", params: { order: echoOf ?? "" } });
      return;
    }
    void (async () => {
      const pending = await loadPending();
      const ours = pending && pending.accountId === signedIn.id ? pending : null;
      const settled = await settlePayment(callback, ours?.orderId ?? null, signedIn.id);
      if (!settled) {
        setNothing(true);
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

  if (state.status === "signedOut") {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
          <Text variant="title1" accessibilityRole="header">
            {t("payment.signInTitle")}
          </Text>
          <Text variant="body" tone="soft">
            {t("payment.signInBody")}
          </Text>
          <Button
            label={t("payment.signIn")}
            onPress={() => {
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
