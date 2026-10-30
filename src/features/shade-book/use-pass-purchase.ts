import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { ShadeBook } from "@/api/types";
import { useSession } from "@/auth/session";
import { paymentsMode } from "@/config/env";
import { buyPack, fetchPlayPrices, ownedMessage } from "@/features/payments/play/play-checkout";
import { usePlayPurchase, type PlayPurchaseState } from "@/features/payments/play/play-payments";
import { t } from "@/i18n";
import { formatRupees } from "@/lib/money";

import { buyPassOnWebsite, noticeFor, type PassNotice } from "./pass";

export type { PassNotice } from "./pass";

/**
 * The Shade Book pass's Buy button, wherever it is shown. In the Android store build it is
 * a Google Play purchase of its own product, at Google's price — nothing there mentions the
 * website. Everywhere else it is Razorpay Checkout on the website (pass.ts), at the server's
 * price. Either way only the server opens the book, and the book is read again once it has.
 */
export function usePassPurchase(book: ShadeBook | undefined) {
  const { state } = useSession();
  const profile = state.status === "signedIn" ? state.profile : null;
  const play = paymentsMode() === "play";
  const productId = book?.access.playProductId ?? null;
  const prices = useQuery({
    queryKey: keys.playPrices(productId ?? ""),
    queryFn: () => fetchPlayPrices(productId ? [productId] : []),
    enabled: play && Boolean(productId),
    staleTime: 5 * 60_000,
  });
  const playPrice = prices.data?.find((p) => p.productId === productId)?.displayPrice ?? null;
  const price = play ? playPrice : book ? formatRupees(book.access.pricePaise) : null;
  // A pass that can't be sold here is never offered: no Play product (or Google doesn't
  // know it), or no Razorpay on this server.
  const sellable = play ? Boolean(productId && playPrice) : Boolean(book?.access.purchasable);

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
    if (busy || !book) return;
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
        else if (result.kind === "no-answer") setNotice({ tone: "info", message: t("shadeBook.unfinished") });
        return;
      }
      const outcome = await buyPassOnWebsite({
        name: profile?.namePending ? null : profile?.name,
        email: profile?.email,
        contact: profile?.phoneNumber,
      });
      if (live.current) setNotice(noticeFor(outcome));
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
    notice: (token ? playNoticeFor(purchase) : null) ?? notice,
    clearNotice: () => {
      setNotice(null);
      setToken(null);
    },
  };
}

/** What a Google Play purchase of the pass has come to, as the screen says it. */
export function playNoticeFor(purchase: PlayPurchaseState | null): PassNotice | null {
  switch (purchase?.kind) {
    case "granted":
      return { tone: "success", message: t("shadeBook.openedPlain") };
    case "pending":
      return { tone: "info", message: t("shadeBook.playPending") };
    case "checking":
      return { tone: "info", message: t("shadeBook.checking") };
    case "refused":
      return { tone: "danger", message: t("shadeBook.refused", { message: purchase.message }) };
    case "otherAccount":
      return { tone: "warning", message: ownedMessage("otherAccount") };
    default:
      return null;
  }
}
