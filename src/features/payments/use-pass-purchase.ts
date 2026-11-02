import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { useSession } from "@/auth/session";
import { paymentsMode } from "@/config/env";
import { buyPack, fetchPlayPrices, ownedMessage } from "@/features/payments/play/play-checkout";
import { usePlayPurchase, type PlayPurchaseState } from "@/features/payments/play/play-payments";
import { formatRupees } from "@/lib/money";

import type { OpenedPass, PassNotice, PassRail, PassWords } from "./day-pass";

export type { PassNotice } from "./day-pass";

/** What a pass's screen knows about buying it: its price, and where it can be sold. */
export interface PassAccess {
  pricePaise: number;
  /** Whether Razorpay can sell it (the website's checkout). */
  purchasable: boolean;
  /** The Google Play product it is sold as in the Android store build. */
  playProductId?: string | null;
}

/**
 * A 24-hour pass's Buy button, wherever it is shown — the Shade Book's or the Colour finder's.
 * In the Android store build it is a Google Play purchase of the pass's own product, at
 * Google's price — nothing there mentions the website. Everywhere else it is Razorpay Checkout
 * on the website (`rail`), at the server's price. Either way only the server opens the pass,
 * and what it opens is read again once it has.
 */
export function usePassPurchase<P extends OpenedPass>(access: PassAccess | undefined, rail: PassRail<P>) {
  const { state } = useSession();
  const profile = state.status === "signedIn" ? state.profile : null;
  const play = paymentsMode() === "play";
  const productId = access?.playProductId ?? null;
  const prices = useQuery({
    queryKey: keys.playPrices(productId ?? ""),
    queryFn: () => fetchPlayPrices(productId ? [productId] : []),
    enabled: play && Boolean(productId),
    staleTime: 5 * 60_000,
  });
  const playPrice = prices.data?.find((p) => p.productId === productId)?.displayPrice ?? null;
  const price = play ? playPrice : access ? formatRupees(access.pricePaise) : null;
  // A pass that can't be sold here is never offered: no Play product (or Google doesn't
  // know it), or no Razorpay on this server.
  const sellable = play ? Boolean(productId && playPrice) : Boolean(access?.purchasable);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PassNotice | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const purchase = usePlayPurchase(token ?? "");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const buy = async () => {
    if (busy || !access) return;
    setBusy(true);
    setNotice(null);
    setToken(null);
    try {
      if (play) {
        if (!productId) return;
        const result = await buyPack(productId);
        if (!live.current) return;
        if (result.kind === "bought") setToken(result.token);
        else if (result.kind === "owned") setNotice({ tone: "info", message: ownedMessage(result.notice) });
        else if (result.kind === "failed") setNotice({ tone: "danger", message: result.message });
        else if (result.kind === "no-answer") setNotice({ tone: "info", message: rail.words.unfinished() });
        return;
      }
      const outcome = await rail.buyOnWebsite({
        name: profile?.namePending ? null : profile?.name,
        email: profile?.email,
        contact: profile?.phoneNumber,
      });
      if (live.current) setNotice(rail.noticeFor(outcome));
    } catch (err) {
      // Nothing was opened or paid: the order was refused, or there was no signal.
      if (live.current) setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      if (live.current) setBusy(false);
    }
  };

  const confirming = purchase?.kind === "verifying";
  return {
    price,
    sellable,
    buy,
    busy: busy || confirming,
    // A Google Play purchase is settled by the server: what became of it, as it does.
    notice: (token ? playNoticeFor(purchase, rail.words) : null) ?? notice,
    clearNotice: () => {
      setNotice(null);
      setToken(null);
    },
  };
}

/** What a Google Play purchase of a pass has come to, in that pass's words. */
export function playNoticeFor(purchase: PlayPurchaseState | null, words: PassWords): PassNotice | null {
  switch (purchase?.kind) {
    case "granted":
      return { tone: "success", message: words.openedPlain() };
    case "pending":
      return { tone: "info", message: words.playPending() };
    case "checking":
      return { tone: "info", message: words.checking() };
    case "refused":
      return { tone: "danger", message: words.refused(purchase.message) };
    case "otherAccount":
      return { tone: "warning", message: ownedMessage("otherAccount") };
    default:
      return null;
  }
}
