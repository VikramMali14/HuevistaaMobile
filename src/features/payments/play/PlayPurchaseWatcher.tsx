import { useEffect } from "react";
import { AppState } from "react-native";

import { useSession } from "@/auth/session";
import { paymentsMode } from "@/config/env";

import { reconcilePlay, startPlay } from "./play-checkout";

/**
 * Mounted once under the customer's screens, beside RenderWatcher — so only a signed-in
 * customer ever connects to Google Play (a painter never does). In the Play build it
 * listens for every purchase Google reports, and hands over what Google still holds
 * unfinished: on mount, and each time the app comes back to the front (a pending payment
 * may have gone through meanwhile). A new profile starts it afresh. Renders nothing; does
 * nothing where the website takes the payments.
 */
export function PlayPurchaseWatcher() {
  const { profile } = useSession();
  const accountId = profile?.id ?? null;

  useEffect(() => {
    if (!accountId || paymentsMode() !== "play") return;
    const stop = startPlay();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reconcilePlay();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [accountId]);

  return null;
}
