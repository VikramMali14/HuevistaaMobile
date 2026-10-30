import AsyncStorage from "@react-native-async-storage/async-storage";

import { billingApi } from "@/api/endpoints/billing";
import { shadeBookApi } from "@/api/endpoints/shade-book";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { ShadeBookPass } from "@/api/types";
import { checkoutUrl, type PayCallback, type Prefill } from "@/features/payments/pay-link";
import { inCheckoutSession, refusedForGood } from "@/features/payments/payments";
import { t } from "@/i18n";

import { passEnds } from "./book";

/**
 * Buying 24 hours of the Shade Book outside Google Play — on iOS, and on an Android build
 * that pays on the website: the order from the server, Razorpay Checkout on the website's
 * /pay/mobile page in a browser session (the basket's own, so D3 knows its echo), then the
 * server's verification of the signature. Nothing is decided on the phone. A payment that
 * went through but couldn't be confirmed is never "failed": the server's webhook opens the
 * book by itself, so the book is read again rather than anything being kept here.
 *
 * The Android store build sells the pass through Google Play instead (play-checkout.ts),
 * the same way as the room and credit packs.
 */
export type PassOutcome =
  | { kind: "opened"; pass: ShadeBookPass }
  /** Paid; the confirmation didn't get through yet. The webhook opens the book meanwhile. */
  | { kind: "checking"; message: string }
  /** The server refused this payment for good. */
  | { kind: "refused"; message: string }
  | { kind: "cancelled" }
  | { kind: "failed"; description?: string }
  /** The browser closed and the page said nothing: not known to be paid or not. */
  | { kind: "unfinished" };

/** What the app tells the payment audit it is (the website sends its page address). */
const PAGE = "huevista://shade-book";
/** The pass's order while its checkout is open — for D3, should Android stop the app meanwhile. */
const KEY = "hv.shadeBookOrder";
/** An order older than this is a checkout that was walked away from. */
const STALE_MS = 2 * 60 * 60_000;

interface KeptOrder {
  orderId: string;
  startedAt: number;
}

async function keepOrder(orderId: string): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ orderId, startedAt: Date.now() } satisfies KeptOrder)).catch(() => {});
}

/** The pass order whose checkout this phone opened last, unless it is long gone. */
export async function keptPassOrder(now: number = Date.now()): Promise<KeptOrder | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const kept = raw ? (JSON.parse(raw) as Partial<KeptOrder>) : null;
    if (!kept || typeof kept.orderId !== "string" || typeof kept.startedAt !== "number") return null;
    return now - kept.startedAt > STALE_MS ? null : { orderId: kept.orderId, startedAt: kept.startedAt };
  } catch {
    return null;
  }
}

/** The pass's checkout is over (or the account signed out). */
export async function forgetPassOrder(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

function readBookAgain() {
  void queryClient.invalidateQueries({ queryKey: keys.shadeBook }).catch(() => {});
}

/**
 * Pay for the pass on the website. Throws only before anything is opened (the order
 * refused, no network) — nothing has been paid then.
 */
export async function buyPassOnWebsite(prefill?: Prefill): Promise<PassOutcome> {
  const order = await shadeBookApi.passOrder();
  await keepOrder(order.orderId);
  void billingApi.reportCheckout(order.orderId, { status: "OPENED", pageUrl: PAGE });
  const url = checkoutUrl(
    { orderId: order.orderId, razorpayKeyId: order.razorpayKeyId, amountPaise: order.amount, currency: order.currency },
    `${order.label} · ${order.hours}-hour pass`,
    prefill,
  );
  return inCheckoutSession(order.orderId, url, (answer) => settlePassAnswer(answer, order.orderId));
}

/**
 * Act on what the payment page handed back for the pass's order — from the session, or
 * from D3 on a cold start. A success is confirmed with the server; the book is read again
 * whatever happened, since the webhook may have opened it already.
 */
export async function settlePassAnswer(answer: PayCallback | null, orderId: string): Promise<PassOutcome> {
  if (!answer || answer.status === "unknown") {
    readBookAgain();
    return { kind: "unfinished" };
  }
  if (answer.status === "cancelled") {
    void billingApi.reportCheckout(orderId, { status: "ABANDONED", pageUrl: PAGE });
    await forgetPassOrder();
    return { kind: "cancelled" };
  }
  if (answer.status === "failed") {
    void billingApi.reportCheckout(orderId, {
      status: "FAILED",
      pageUrl: PAGE,
      errorCode: answer.code,
      errorDescription: answer.description,
    });
    await forgetPassOrder();
    return { kind: "failed", description: answer.description };
  }
  try {
    const pass = await shadeBookApi.passVerify({ orderId: answer.orderId, paymentId: answer.paymentId, signature: answer.signature });
    await forgetPassOrder();
    readBookAgain();
    return { kind: "opened", pass };
  } catch (err) {
    const message = messageFor(err);
    void billingApi.reportCheckout(answer.orderId, {
      status: "VERIFY_FAILED",
      pageUrl: PAGE,
      paymentId: answer.paymentId,
      errorDescription: message,
    });
    readBookAgain();
    if (refusedForGood(err)) {
      await forgetPassOrder();
      return { kind: "refused", message };
    }
    return { kind: "checking", message };
  }
}

/**
 * D3 on a cold start: whether the answer it opened with is the pass's. A success names its
 * order; a cancel or failure names none, and is the pass's when its checkout is the one this
 * phone opened last.
 */
export async function isPassAnswer(answer: PayCallback, cartStartedAt: number | null): Promise<string | null> {
  const kept = await keptPassOrder();
  if (!kept) return null;
  if (answer.status === "success") return answer.orderId === kept.orderId ? kept.orderId : null;
  if (answer.status === "unknown") return null;
  return cartStartedAt === null || kept.startedAt > cartStartedAt ? kept.orderId : null;
}

/** A purchase's outcome as the screen says it. */
export interface PassNotice {
  tone: "info" | "success" | "warning" | "danger";
  message: string;
}

/** What a website checkout's outcome says on the screen. */
export function noticeFor(outcome: PassOutcome): PassNotice | null {
  switch (outcome.kind) {
    case "opened": {
      const ends = passEnds(outcome.pass.expiresAt);
      return { tone: "success", message: ends ? t("shadeBook.opened", { time: ends }) : t("shadeBook.openedPlain") };
    }
    case "checking":
      return { tone: "info", message: t("shadeBook.checking") };
    case "refused":
      return { tone: "danger", message: t("shadeBook.refused", { message: outcome.message }) };
    case "cancelled":
      return { tone: "info", message: t("shadeBook.cancelled") };
    case "failed":
      return { tone: "danger", message: t("shadeBook.failed") };
    default:
      return { tone: "info", message: t("shadeBook.unfinished") };
  }
}
