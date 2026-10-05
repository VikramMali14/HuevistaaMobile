import * as WebBrowser from "expo-web-browser";
import { useSyncExternalStore } from "react";

import { billingApi } from "@/api/endpoints/billing";
import { messageFor } from "@/api/errors";
import { paymentChanges } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { CartSplit } from "@/api/types";
import { deepLinks } from "@/config/env";

import { checkoutUrl, describeOrder, parsePayCallback, type PayCallback, type Prefill } from "./pay-link";
import { clearPending, markPaid, peekPending, savePending } from "./pending-payment";

/**
 * Paying for a basket (C28 → C29, and D3 on a cold start) — 07 "Payments".
 *
 * Money is never decided on the phone: the order is priced by the server, Checkout runs on
 * the website's /pay/mobile page in a browser session, and only the server's verification
 * of the signature changes what the app shows. Once Razorpay says "paid", nothing here ever
 * says "failed": a verification that doesn't get through is "we're checking", and is tried
 * again until it does (the server's webhook delivers the payment either way).
 */
export type PaymentState =
  | { kind: "verifying"; orderId: string; paymentId: string }
  /** Confirmed. `rooms`/`credits` are what the order handed over (0 when not known here). */
  | { kind: "verified"; orderId: string; paymentId: string; rooms: number; credits: number }
  /** Paid, not yet confirmed. Never "failed", and never a Pay button. */
  | { kind: "checking"; orderId: string; paymentId: string; signature: string; message: string }
  | { kind: "failed"; orderId: string; code?: string; description?: string; basket?: Basket }
  | { kind: "cancelled"; orderId: string; basket?: Basket };

/** What was in the basket (what the order would have handed over) — for Try again. */
export interface Basket {
  rooms: number;
  credits: number;
}

function basketOf(orderId: string): Basket | undefined {
  const pending = peekPending();
  return pending?.orderId === orderId && pending.rooms + pending.credits > 0
    ? { rooms: pending.rooms, credits: pending.credits }
    : undefined;
}

const states = new Map<string, PaymentState>();
const verifies = new Map<string, Promise<PaymentState>>();
const listeners = new Set<() => void>();
/** The order whose browser session is open in this run of the app, if any (D3 reads it). */
let active: string | null = null;

/** What the app tells the payment audit it is (the website sends its page address). */
const PAGE = "huevista://checkout";

function set(state: PaymentState): PaymentState {
  states.set(state.orderId, state);
  for (const l of listeners) l();
  return state;
}

export function paymentState(orderId: string): PaymentState | null {
  return states.get(orderId) ?? null;
}

export function usePayment(orderId: string): PaymentState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => states.get(orderId) ?? null,
    () => states.get(orderId) ?? null,
  );
}

/** A checkout's browser session is open in this run (so a deep link to D3 is its echo). */
export function checkoutInProgress(): boolean {
  return active !== null;
}

/**
 * Confirm a payment with the server. One verification per payment: on Android the result
 * can reach the app twice (the waiting browser session and the D3 deep link), and the two
 * share it. A failure keeps the proof and reports VERIFY_FAILED; trying again is safe —
 * the server answers a payment it already redeemed for this account as a success.
 */
export function verifyPayment(orderId: string, paymentId: string, signature: string): Promise<PaymentState> {
  const running = verifies.get(paymentId);
  if (running) return running;
  const done = states.get(orderId);
  if (done?.kind === "verified") return Promise.resolve(done);

  set({ kind: "verifying", orderId, paymentId });
  const run = billingApi
    .verifyCart({ orderId, paymentId, signature })
    .then(async () => {
      const pending = peekPending();
      const ours = pending?.orderId === orderId ? pending : null;
      clearPending(orderId);
      await Promise.all(paymentChanges.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).catch(() => {});
      return set({ kind: "verified", orderId, paymentId, rooms: ours?.rooms ?? 0, credits: ours?.credits ?? 0 });
    })
    .catch((err: unknown) => {
      const message = messageFor(err);
      void billingApi.reportCheckout(orderId, { status: "VERIFY_FAILED", pageUrl: PAGE, paymentId, errorDescription: message });
      return set({ kind: "checking", orderId, paymentId, signature, message });
    })
    .finally(() => verifies.delete(paymentId));
  verifies.set(paymentId, run);
  return run;
}

/**
 * Act on what the payment page handed back. `orderId` is the order the app opened (the
 * page's own answer names it only on a success). Returns null for an answer that says
 * nothing about a payment.
 */
export async function settlePayment(
  callback: PayCallback,
  orderId: string | null,
  accountId?: string,
): Promise<PaymentState | null> {
  switch (callback.status) {
    case "success":
      markPaid(callback.orderId, { paymentId: callback.paymentId, signature: callback.signature }, accountId);
      return verifyPayment(callback.orderId, callback.paymentId, callback.signature);
    case "cancelled": {
      if (!orderId) return null;
      void billingApi.reportCheckout(orderId, { status: "ABANDONED", pageUrl: PAGE });
      const basket = basketOf(orderId);
      clearPending(orderId);
      return set({ kind: "cancelled", orderId, basket });
    }
    case "failed": {
      if (!orderId) return null;
      void billingApi.reportCheckout(orderId, {
        status: "FAILED",
        pageUrl: PAGE,
        errorCode: callback.code,
        errorDescription: callback.description,
      });
      const basket = basketOf(orderId);
      clearPending(orderId);
      return set({ kind: "failed", orderId, code: callback.code, description: callback.description, basket });
    }
    default:
      return null;
  }
}

export interface CheckoutInput {
  split: CartSplit;
  accountId: string;
  prefill?: Prefill;
}

/**
 * C28 · Pay: the order from the server, kept on the phone (for D3), Checkout on the
 * website in a browser session, then the answer settled. Throws only when the order can't
 * be made — nothing has been paid then, so the basket can say why and try again.
 */
export async function payForBasket({ split, accountId, prefill }: CheckoutInput): Promise<PaymentState> {
  const order = await billingApi.cartOrder(split);
  savePending({
    accountId,
    orderId: order.orderId,
    amountPaise: order.amountPaise,
    rooms: order.projectsGranted,
    credits: order.creditsGranted,
    startedAt: Date.now(),
  });
  void billingApi.reportCheckout(order.orderId, { status: "OPENED", pageUrl: PAGE });

  active = order.orderId;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(checkoutUrl(order, describeOrder(order), prefill), deepLinks.payCallback);
  } finally {
    active = null;
  }

  const answer = result.type === "success" ? parsePayCallback(result.url) : null;
  // The same answer may already have been settled through D3's deep link.
  const settled =
    (answer && (await settlePayment(answer, order.orderId, accountId))) ?? paymentState(order.orderId);
  if (settled && settled.kind !== "verifying") return settled;
  if (settled?.kind === "verifying") return (await verifies.get(settled.paymentId)) ?? settled;
  // The browser was closed without the page answering: nothing was paid from here.
  return (await settlePayment({ status: "cancelled" }, order.orderId)) as PaymentState;
}

/** Forget every payment of this run (sign-out). */
export function resetPayments() {
  states.clear();
  verifies.clear();
  active = null;
  for (const l of listeners) l();
}
