import { AppState, Platform } from "react-native";

import { queryClient } from "@/api/query-client";
import { paymentChanges } from "@/api/query-keys";
import type { UserProfile } from "@/api/types";
import { useSession } from "@/auth/session";
import { paymentsMode } from "@/config/env";
import { openWebPage, webPages } from "@/lib/open-web";

/**
 * Where this session is sold rooms and Vista credits — 07 "Payments", "Painters and shops".
 *
 * Painters and shops pay on the website, never in the app. Their own sessions have nothing
 * to buy here (a painter's screens sell nothing, and a shop gets S10), but each can be a
 * customer too: their customer profile (`linkedProfile`, their own home) opens the
 * customer's screens, and those would sell to it. So for that profile:
 * - `"website"` where the app may send somebody to the website to pay (paymentsMode
 *   "web"): every Buy opens the website, where they sign in and continue as the customer;
 * - `"none"` in the Android store build: nothing is sold, and nothing says where it is —
 *   Play's anti-steering rule forbids leading anyone to another way to pay.
 *
 * Everyone else buys in the app (`"app"`), as before: Google Play in the store build, the
 * website's Razorpay page elsewhere. The backend holds the same line: Google Play sells to
 * no customer profile (`GET /api/billing/play/products` answers it `eligible: false`).
 */
export type WhereToBuy = "app" | "website" | "none";

export function whereToBuy(profile: Pick<UserProfile, "linkedProfile"> | null | undefined): WhereToBuy {
  if (!profile?.linkedProfile) return "app";
  return paymentsMode() === "web" ? "website" : "none";
}

/** `whereToBuy` for the signed-in session. */
export function useWhereToBuy(): WhereToBuy {
  return whereToBuy(useSession().profile);
}

/**
 * Open the website where a painter's or a shop's own home buys rooms and Vista credits:
 * signed in there as they are here, "Continue as… a customer" lands on its balance. What
 * they buy shows here as soon as they are back — the balances are read again then: when
 * the browser closes on iOS, and when the app is back in front on Android, whose browser
 * answers as soon as it opens.
 */
export async function buyOnWebsite(): Promise<void> {
  const refresh = () => {
    for (const queryKey of paymentChanges) void queryClient.invalidateQueries({ queryKey }).catch(() => {});
  };
  let back: { remove: () => void } | null = null;
  if (Platform.OS === "android") {
    back = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      back?.remove();
      refresh();
    });
  }
  await openWebPage(webPages.buyForOwnHome);
  if (!back) refresh();
}
