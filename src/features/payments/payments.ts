import * as WebBrowser from "expo-web-browser";
import { useSyncExternalStore } from "react";
import { Linking } from "react-native";

import { billingApi } from "@/api/endpoints/billing";
import { isApiError, messageFor } from "@/api/errors";
import { keys, paymentChanges } from "@/api/query-keys";
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
 * says "failed" or "cancelled": a verification that doesn't get through is "we're
 * checking", tried again until it does; only the server's own refusal ends it.
 */
export type PaymentState =
  | { kind: "verifying"; orderId: string; paymentId: string }
  /** Confirmed. `rooms`/`credits` are what the order handed over (0 when not known here). */
  | { kind: "verified"; orderId: string; paymentId: string; rooms: number; credits: number }
  /** Paid, not yet confirmed. Never "failed", and never a Pay button. */
  | { kind: "checking"; orderId: string; paymentId: string; signature: string; message: string }
  /** The server refused this payment for good (it checked the signature, or the order). */
  | { kind: "refused"; orderId: string; paymentId: string; message: string }
  | { kind: "failed"; orderId: string; code?: string; description?: string; basket?: Basket }
  /** The page said the person closed Checkout. */
  | { kind: "cancelled"; orderId: string; basket?: Basket }
  /** The browser closed with no answer from the page: not known to be paid or not. */
  | { kind: "unfinished"; orderId: string; basket?: Basket };

/** What was asked for — for Try again. */
export interface Basket {
  rooms: number;
  credits: number;
}

/** The price changed between the basket and the order: nothing was opened or paid. */
export class PriceChangedError extends Error {
  readonly amountPaise: number;
  constructor(amountPaise: number) {
    super("The price changed");
    this.name = "PriceChangedError";
    this.amountPaise = amountPaise;
  }
}

function basketOf(orderId: string): Basket | undefined {
  const pending = peekPending();
  if (pending?.orderId !== orderId) return undefined;
  if (pending.basket) return pending.basket;
  return pending.rooms + pending.credits > 0 ? { rooms: pending.rooms, credits: pending.credits } : undefined;
}

const states = new Map<string, PaymentState>();
const verifies = new Map<string, Promise<PaymentState>>();
const listeners = new Set<() => void>();
/** The order whose browser session is open (or just closed, awaiting a late answer). */
let active: string | null = null;
/** An answer handed over by D3's deep link while a session is open. */
let delivered: { answer: PayCallback; notify: () => void } | null = null;
/** The last order the app's own session settled, and when — so D3 knows an echo. */
let lastSettled: { orderId: string; at: number } | null = null;

/** What the app tells the payment audit it is (the website sends its page address). */
const PAGE = "huevista://checkout";
/**
 * How long to wait for the page's answer after the browser closes. On Android the browser
 * session ends when the app comes back to the front, which can be a moment BEFORE the
 * redirect carrying the answer arrives.
 */
const LATE_ANSWER_MS = 2500;
/** A cancelled/failed link this soon after the app's own session settled is its echo. */
const ECHO_MS = 2 * 60_000;
/** Settled states that a later cancel or failure must never overwrite. */
const PAID = new Set<PaymentState["kind"]>(["verifying", "checking", "verified"]);

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

/** D3 hands over an answer that arrived as a deep link while a session is open. */
export function deliverPayAnswer(answer: PayCallback) {
  if (answer.status === "unknown" || !delivered) return;
  delivered.answer = answer;
  delivered.notify();
}

/** The app's own session settled this soon: a cancelled or failed link now is its echo. */
export function settledRecently(now: number = Date.now()): boolean {
  return lastSettled !== null && now - lastSettled.at < ECHO_MS;
}

/**
 * The server's 403 when Razorpay itself couldn't be asked about the payment — not a "no",
 * so the proof is kept and checked again (CartPurchaseService: a refused signature or an
 * order that isn't the buyer's says "Payment verification failed.").
 */
const RAZORPAY_UNREACHABLE = "Payment verification error.";

/** A refusal that trying again won't change: the server checked and said no. */
function refusedForGood(err: unknown): boolean {
  return (
    isApiError(err) &&
    err.kind === "http" &&
    err.status >= 400 &&
    err.status < 500 &&
    ![401, 408, 429].includes(err.status) &&
    err.message.trim() !== RAZORPAY_UNREACHABLE
  );
}

/**
 * Confirm a payment with the server. One verification per payment: on Android the result
 * can reach the app twice (the waiting browser session and the D3 deep link), and the two
 * share it. Silence keeps the proof ("checking") and reports VERIFY_FAILED; trying again
 * is safe — the server answers a payment it already redeemed for this account as a
 * success. A refusal for good drops the proof and says the server's reason.
 */
export function verifyPayment(orderId: string, paymentId: string, signature: string): Promise<PaymentState> {
  const running = verifies.get(paymentId);
  if (running) return running;
  const done = states.get(orderId);
  if (done?.kind === "verified") return Promise.resolve(done);

  // Checking again keeps saying "checking" (the screen's own button shows it is busy).
  if (done?.kind !== "checking") set({ kind: "verifying", orderId, paymentId });
  const run = billingApi
    .verifyCart({ orderId, paymentId, signature })
    .then(() => {
      const pending = peekPending();
      const ours = pending?.orderId === orderId ? pending : null;
      clearPending(orderId);
      const state = set({ kind: "verified", orderId, paymentId, rooms: ours?.rooms ?? 0, credits: ours?.credits ?? 0 });
      // Said first; the balances catch up behind it.
      for (const queryKey of paymentChanges) void queryClient.invalidateQueries({ queryKey }).catch(() => {});
      return state;
    })
    .catch((err: unknown) => {
      const message = messageFor(err);
      void billingApi.reportCheckout(orderId, { status: "VERIFY_FAILED", pageUrl: PAGE, paymentId, errorDescription: message });
      if (refusedForGood(err)) {
        clearPending(orderId);
        return set({ kind: "refused", orderId, paymentId, message });
      }
      return set({ kind: "checking", orderId, paymentId, signature, message });
    })
    .finally(() => verifies.delete(paymentId));
  verifies.set(paymentId, run);
  return run;
}

/**
 * Act on what the payment page handed back. `orderId` is the order the app opened (the
 * page's own answer names it only on a success). A success always wins — over an earlier
 * cancel, failure or a browser closed with no answer. A cancel or failure never overwrites
 * a payment that went through, nor a kept proof. Returns null for an answer that says
 * nothing about a payment.
 */
export async function settlePayment(
  callback: PayCallback,
  orderId: string | null,
  accountId?: string,
): Promise<PaymentState | null> {
  if (callback.status === "success") {
    markPaid(callback.orderId, { paymentId: callback.paymentId, signature: callback.signature }, accountId);
    return verifyPayment(callback.orderId, callback.paymentId, callback.signature);
  }
  if (callback.status === "unknown" || !orderId) return null;

  const existing = states.get(orderId);
  if (existing && PAID.has(existing.kind)) return existing;
  const pending = peekPending();
  if (pending?.orderId === orderId && pending.paid) return verifyPayment(orderId, pending.paid.paymentId, pending.paid.signature);

  const basket = basketOf(orderId);
  if (callback.status === "cancelled") {
    void billingApi.reportCheckout(orderId, { status: "ABANDONED", pageUrl: PAGE });
    clearPending(orderId);
    return set({ kind: "cancelled", orderId, basket });
  }
  void billingApi.reportCheckout(orderId, {
    status: "FAILED",
    pageUrl: PAGE,
    errorCode: callback.code,
    errorDescription: callback.description,
  });
  clearPending(orderId);
  return set({ kind: "failed", orderId, code: callback.code, description: callback.description, basket });
}

/** Wait a moment for an answer that arrives after the browser has closed. */
function lateAnswer(slot: { answer: PayCallback | null; wake: () => void }): Promise<PayCallback | null> {
  if (slot.answer) return Promise.resolve(slot.answer);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(slot.answer), LATE_ANSWER_MS);
    slot.wake = () => {
      clearTimeout(timer);
      resolve(slot.answer);
    };
  });
}

export interface CheckoutInput {
  split: CartSplit;
  /** What was asked for — kept for Try again. */
  basket: Basket;
  /** The total the basket showed: an order priced differently is not opened. */
  expectedPaise: number;
  accountId: string;
  prefill?: Prefill;
}

/**
 * C28 · Pay: the order from the server (refused if its price is not the one shown), kept
 * on the phone (for D3), Checkout on the website in a browser session, then the answer
 * settled. Throws only before anything is opened — nothing has been paid then, so the
 * basket can say why and try again.
 */
export async function payForBasket({ split, basket, expectedPaise, accountId, prefill }: CheckoutInput): Promise<PaymentState> {
  let order;
  try {
    order = await billingApi.cartOrder(split);
  } catch (err) {
    // An offer that ended, a quantity over the limit: the counter is out of date.
    if (isApiError(err) && err.kind === "http") void queryClient.invalidateQueries({ queryKey: keys.cart });
    throw err;
  }
  if (order.amountPaise !== expectedPaise) {
    void queryClient.invalidateQueries({ queryKey: keys.cart });
    throw new PriceChangedError(order.amountPaise);
  }
  savePending({
    accountId,
    orderId: order.orderId,
    amountPaise: order.amountPaise,
    rooms: order.projectsGranted,
    credits: order.creditsGranted,
    basket,
    startedAt: Date.now(),
  });
  void billingApi.reportCheckout(order.orderId, { status: "OPENED", pageUrl: PAGE });

  // Answers that come as a deep link (D3, or the app's own link listener) land here too.
  const slot: { answer: PayCallback | null; wake: () => void } = { answer: null, wake: () => {} };
  delivered = {
    answer: { status: "unknown" },
    notify: () => {
      // A success, from wherever it came, is never replaced.
      if (delivered && slot.answer?.status !== "success") slot.answer = delivered.answer;
      slot.wake();
    },
  };
  const listener = Linking.addEventListener("url", ({ url }) => {
    if (url.startsWith(deepLinks.payCallback)) deliverPayAnswer(parsePayCallback(url));
  });
  active = order.orderId;
  try {
    const result = await WebBrowser.openAuthSessionAsync(
      checkoutUrl(order, describeOrder(order), prefill),
      deepLinks.payCallback,
      // No "wants to use … to sign in" prompt on iOS: Checkout needs no shared cookies.
      { preferEphemeralSession: true },
    );
    const fromSession = result.type === "success" ? parsePayCallback(result.url) : null;
    if (fromSession && fromSession.status !== "unknown" && slot.answer?.status !== "success") slot.answer = fromSession;
    const answer = await lateAnswer(slot);
    const settled = answer ? await settlePayment(answer, order.orderId, accountId) : null;
    if (settled) return settled;
    // The browser closed and the page said nothing: it may or may not have been paid
    // (a browser that refuses the redirect; a UPI payment finishing later). Not
    // "cancelled" — and the balances are read again in case it was paid.
    const known = states.get(order.orderId);
    if (known) return known;
    const unfinished = set({ kind: "unfinished", orderId: order.orderId, basket: basketOf(order.orderId) });
    for (const queryKey of paymentChanges) void queryClient.invalidateQueries({ queryKey }).catch(() => {});
    return unfinished;
  } finally {
    listener.remove();
    delivered = null;
    active = null;
    lastSettled = { orderId: order.orderId, at: Date.now() };
  }
}

/** Forget every payment of this run (sign-out). */
export function resetPayments() {
  states.clear();
  verifies.clear();
  active = null;
  delivered = null;
  lastSettled = null;
  for (const l of listeners) l();
}
