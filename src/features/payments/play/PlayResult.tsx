import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";

import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";

import { CheckingResult, OtherAccountResult, PaidResult, PendingResult, RefusedResult, WaitingResult } from "../ResultBlocks";
import { reconcilePlay } from "./play-checkout";
import { checkPlayPurchaseAgain, playOrderId, usePlayPurchase } from "./play-payments";

/** Tries again by itself while the screen is open: soon, then less often (as C29 does). */
const RETRY_AFTER_MS = [4_000, 10_000, 30_000];

/**
 * C29 for a Google Play purchase (`/payment-result?play=<purchase token>`). What the server
 * said after reading the purchase from Google — never what the purchase sheet said.
 * Granted: what was added and its reference. Google still waiting for the money: said so,
 * nothing to pay again. Not answered yet: "We're checking your payment", tried again by
 * itself and on demand — never a Buy button meanwhile. Refused for good: the server's
 * sentence and Get help. Another account's: said plainly, and left for that account.
 */
export function PlayResult({ token, forImage }: { token: string; forImage: boolean }) {
  const router = useRouter();
  const state = usePlayPurchase(token);
  const checking = useSubmit();
  const tries = useRef(0);

  // While checking, try again by itself a few times.
  const checkingState = state?.kind === "checking" ? state : null;
  useEffect(() => {
    if (!checkingState || tries.current >= RETRY_AFTER_MS.length) return;
    const wait = RETRY_AFTER_MS[tries.current]!;
    tries.current += 1;
    const timer = setTimeout(() => void checkPlayPurchaseAgain(checkingState.token), wait);
    return () => clearTimeout(timer);
  }, [checkingState]);

  // Back to the tabs that are already there, rather than a second copy of them.
  const goTo = (href: Href) => (router.canDismiss() ? router.dismissTo(href) : router.replace(href));
  const home = () => goTo("/home");
  const orderId = playOrderId(token);

  if (!state || state.kind === "verifying") return <WaitingResult nothing={!state} onHome={home} />;

  switch (state.kind) {
    case "granted":
      return <PaidResult rooms={state.rooms} credits={state.credits} forImage={forImage} reference={state.reference ?? orderId} onHome={home} />;
    case "checking":
      return (
        <CheckingResult
          reference={orderId}
          busy={checking.busy}
          onCheck={() =>
            void checking.run(async () => {
              await checkPlayPurchaseAgain(token);
            })
          }
          onHome={home}
        />
      );
    case "pending":
      // Google hands the purchase back once the money arrives: look again.
      return <PendingResult busy={checking.busy} onCheck={() => void checking.run(reconcilePlay)} onHome={home} />;
    case "refused":
      return (
        <RefusedResult
          message={state.message}
          reference={orderId}
          onHelp={() =>
            router.push({
              pathname: "/help",
              params: { draft: orderId ? t("help.paymentDraft", { id: orderId }) : t("help.playDraft") },
            })
          }
          onHome={home}
        />
      );
    default:
      return <OtherAccountResult onHome={home} />;
  }
}
