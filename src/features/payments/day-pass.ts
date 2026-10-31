import AsyncStorage from "@react-native-async-storage/async-storage";

import { billingApi, type PaymentProof } from "@/api/endpoints/billing";
import { messageFor } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import { passEnds } from "@/features/shade-book/book";

import { checkoutUrl, type PayCallback, type Prefill } from "./pay-link";
import { inCheckoutSession, refusedForGood } from "./payments";

/**
 * Buying a 24-hour pass outside Google Play — on iOS, and on an Android build that pays on the
 * website: the order from the server, Razorpay Checkout on the website's /pay/mobile page in a
 * browser session (the basket's own, so D3 knows its echo), then the server's verification of
 * the signature. Nothing is decided on the phone. A payment that went through but couldn't be
 * confirmed is never "failed": the server's webhook opens the pass by itself, so what it opens
 * is read again rather than anything being kept here.
 *
 * One rail for every pass — the Shade Book's and the Colour finder's — each told apart by its
 * {@link PassSpec}: its own routes, its own kept order and its own words. The Android store
 * build sells each pass through Google Play instead (play-checkout.ts).
 */

/** What a pass's order carries: the website's checkout is opened with it. */
export interface PassOrder {
  orderId: string;
  label: string;
  /** Paise, priced by the server. */
  amount: number;
  currency: string;
  hours: number;
  razorpayKeyId: string;
}

/** The window a payment opened. */
export interface OpenedPass {
  expiresAt: string;
}

export type PassOutcome<P extends OpenedPass = OpenedPass> =
  | { kind: "opened"; pass: P }
  /** Paid; the confirmation didn't get through yet. The webhook opens the pass meanwhile. */
  | { kind: "checking"; message: string }
  /** The server refused this payment for good. */
  | { kind: "refused"; message: string }
  | { kind: "cancelled" }
  | { kind: "failed"; description?: string }
  /** The browser closed and the page said nothing: not known to be paid or not. */
  | { kind: "unfinished" };

/** A purchase's outcome as the screen says it. */
export interface PassNotice {
  tone: "info" | "success" | "warning" | "danger";
  message: string;
}

/** Each outcome of buying one pass, in that pass's own words. */
export interface PassWords {
  opened: (time: string) => string;
  openedPlain: () => string;
  checking: () => string;
  refused: (message: string) => string;
  cancelled: () => string;
  failed: () => string;
  unfinished: () => string;
  /** Google Play is still waiting for the money. */
  playPending: () => string;
}

/** One pass: where it is bought, where its order waits, and what to read again once it opens. */
export interface PassSpec<P extends OpenedPass> {
  /** What the app tells the payment audit it is (the website sends its page address). */
  page: string;
  /** The pass's order while its checkout is open — for D3, should Android stop the app meanwhile. */
  storageKey: string;
  order: () => Promise<PassOrder>;
  verify: (proof: PaymentProof) => Promise<P>;
  /** What a payment may have opened, read again whatever became of it. */
  queryKey: readonly unknown[];
  words: PassWords;
}

/** An order whose checkout this phone opened. */
export interface KeptOrder {
  orderId: string;
  startedAt: number;
}

/** An order older than this is a checkout that was walked away from. */
const STALE_MS = 2 * 60 * 60_000;

/** Buying one pass on the website, and settling what the payment page hands back. */
export interface PassRail<P extends OpenedPass> {
  words: PassWords;
  /**
   * Pay for the pass on the website. Throws only before anything is opened (the order
   * refused, no network) — nothing has been paid then.
   */
  buyOnWebsite: (prefill?: Prefill) => Promise<PassOutcome<P>>;
  /**
   * Act on what the payment page handed back for the pass's order — from the session, or
   * from D3 on a cold start. A success is confirmed with the server; what the pass opens is
   * read again whatever happened, since the webhook may have opened it already.
   */
  settleAnswer: (answer: PayCallback | null, orderId: string) => Promise<PassOutcome<P>>;
  /**
   * D3 on a cold start: whether the answer it opened with is this pass's. A success names its
   * order; a cancel or failure names none, and is this pass's when its checkout is the one this
   * phone opened last — after `otherStartedAt`, the latest of the other checkouts it kept.
   */
  isAnswer: (answer: PayCallback, otherStartedAt: number | null) => Promise<string | null>;
  /** The pass order whose checkout this phone opened last, unless it is long gone. */
  kept: (now?: number) => Promise<KeptOrder | null>;
  /** The pass's checkout is over (or the account signed out). */
  forget: () => Promise<void>;
  /** What a website checkout's outcome says on the screen. */
  noticeFor: (outcome: PassOutcome<P>) => PassNotice | null;
}

export function passRail<P extends OpenedPass>(spec: PassSpec<P>): PassRail<P> {
  const keep = async (orderId: string) => {
    await AsyncStorage.setItem(spec.storageKey, JSON.stringify({ orderId, startedAt: Date.now() } satisfies KeptOrder)).catch(
      () => {},
    );
  };

  const kept = async (now: number = Date.now()): Promise<KeptOrder | null> => {
    try {
      const raw = await AsyncStorage.getItem(spec.storageKey);
      const order = raw ? (JSON.parse(raw) as Partial<KeptOrder>) : null;
      if (!order || typeof order.orderId !== "string" || typeof order.startedAt !== "number") return null;
      return now - order.startedAt > STALE_MS ? null : { orderId: order.orderId, startedAt: order.startedAt };
    } catch {
      return null;
    }
  };

  const forget = async () => {
    await AsyncStorage.removeItem(spec.storageKey).catch(() => {});
  };

  const readAgain = () => {
    void queryClient.invalidateQueries({ queryKey: spec.queryKey }).catch(() => {});
  };

  const settleAnswer = async (answer: PayCallback | null, orderId: string): Promise<PassOutcome<P>> => {
    if (!answer || answer.status === "unknown") {
      readAgain();
      return { kind: "unfinished" };
    }
    if (answer.status === "cancelled") {
      void billingApi.reportCheckout(orderId, { status: "ABANDONED", pageUrl: spec.page });
      await forget();
      return { kind: "cancelled" };
    }
    if (answer.status === "failed") {
      void billingApi.reportCheckout(orderId, {
        status: "FAILED",
        pageUrl: spec.page,
        errorCode: answer.code,
        errorDescription: answer.description,
      });
      await forget();
      return { kind: "failed", description: answer.description };
    }
    try {
      const pass = await spec.verify({ orderId: answer.orderId, paymentId: answer.paymentId, signature: answer.signature });
      await forget();
      readAgain();
      return { kind: "opened", pass };
    } catch (err) {
      const message = messageFor(err);
      void billingApi.reportCheckout(answer.orderId, {
        status: "VERIFY_FAILED",
        pageUrl: spec.page,
        paymentId: answer.paymentId,
        errorDescription: message,
      });
      readAgain();
      if (refusedForGood(err)) {
        await forget();
        return { kind: "refused", message };
      }
      return { kind: "checking", message };
    }
  };

  return {
    words: spec.words,
    buyOnWebsite: async (prefill) => {
      const order = await spec.order();
      await keep(order.orderId);
      void billingApi.reportCheckout(order.orderId, { status: "OPENED", pageUrl: spec.page });
      const url = checkoutUrl(
        { orderId: order.orderId, razorpayKeyId: order.razorpayKeyId, amountPaise: order.amount, currency: order.currency },
        `${order.label} · ${order.hours}-hour pass`,
        prefill,
      );
      return inCheckoutSession(order.orderId, url, (answer) => settleAnswer(answer, order.orderId));
    },
    settleAnswer,
    isAnswer: async (answer, otherStartedAt) => {
      const order = await kept();
      if (!order) return null;
      if (answer.status === "success") return answer.orderId === order.orderId ? order.orderId : null;
      if (answer.status === "unknown") return null;
      return otherStartedAt === null || order.startedAt > otherStartedAt ? order.orderId : null;
    },
    kept,
    forget,
    noticeFor: (outcome) => {
      const { words } = spec;
      switch (outcome.kind) {
        case "opened": {
          const ends = passEnds(outcome.pass.expiresAt);
          return { tone: "success", message: ends ? words.opened(ends) : words.openedPlain() };
        }
        case "checking":
          return { tone: "info", message: words.checking() };
        case "refused":
          return { tone: "danger", message: words.refused(outcome.message) };
        case "cancelled":
          return { tone: "info", message: words.cancelled() };
        case "failed":
          return { tone: "danger", message: words.failed() };
        default:
          return { tone: "info", message: words.unfinished() };
      }
    },
  };
}

/** The latest of the checkouts' start times this phone kept; null when it kept none. */
export function latestStart(...starts: (number | null | undefined)[]): number | null {
  return starts.reduce<number | null>((latest, at) => (at == null ? latest : latest === null || at > latest ? at : latest), null);
}
