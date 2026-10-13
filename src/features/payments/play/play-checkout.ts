import { billingApi } from "@/api/endpoints/billing";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { PlayCatalogue } from "@/api/types";
import { t } from "@/i18n";

import {
  isOurs,
  isSettled,
  markPending,
  onPlayReset,
  rememberPlayAccount,
  verifyPlayPurchase,
  type PlayPurchaseState,
} from "./play-payments";
import * as store from "./store";

type BuyOutcome = store.BuyOutcome;
type StoreFailure = store.StoreFailure;
type StorePurchase = store.StorePurchase;

/**
 * Buying a pack through Google Play, and settling whatever Google hands the phone
 * (07 "Payments", "Google Play"). The intent comes from the server first: its two ids go
 * on the purchase, so the server can tell exactly which account paid — another account
 * signed in on this phone can never receive it. Every purchase, from wherever it came, is
 * handed to play-payments.ts, which asks the server once per token.
 */

/** What the app tells the payment audit it is (the website sends its page address). */
const PAGE = "huevista://checkout";
/**
 * How long to wait for Google's listener when the purchase sheet closed with no purchase
 * in its answer: the same purchase also arrives there, sometimes a moment later.
 */
const LATE_PURCHASE_MS = 5000;

let connection: Promise<boolean> | null = null;
/** The buy waiting on Google's sheet, so its listener can answer it. */
let active: { productId: string; intentId: string; since: number; heard: (outcome: Heard) => void } | null = null;
let reconciling: Promise<void> | null = null;
/** Intents already reported ABANDONED (the sheet's cancel can arrive twice). */
const abandoned = new Set<string>();

/** Connect to Google Play once; a failed try is tried again next time. */
export function ensureConnection(): Promise<boolean> {
  connection ??= store.initConnection().catch((err: unknown) => {
    connection = null;
    throw err;
  });
  return connection;
}

/** GET /products, remembering this account's id on Google's side. */
async function fetchPlayCatalogue(): Promise<PlayCatalogue> {
  const catalogue = await billingApi.playProducts();
  rememberPlayAccount(catalogue.obfuscatedAccountId, catalogue.previousObfuscatedAccountIds);
  return catalogue;
}

/** C28's query for the packs on sale (the watcher's reconcile reads the same one). */
export const playCatalogueQuery = { queryKey: keys.playProducts, queryFn: fetchPlayCatalogue };

/** Google's price for each pack, once connected. */
export async function fetchPlayPrices(productIds: string[]): Promise<store.StoreProduct[]> {
  await ensureConnection();
  return store.fetchProducts(productIds);
}

/**
 * Hand one purchase over. Another account's is skipped entirely: its token is never sent
 * under this session. A pending one is only noted — the server is asked once Google says
 * it's purchased. Returns null for a purchase this run won't ask about.
 */
export function takePurchase(purchase: StorePurchase): Promise<PlayPurchaseState> | null {
  const { token, productId } = purchase;
  if (!token || !isOurs(purchase.accountId)) return null;
  if (purchase.state === "pending") return Promise.resolve(markPending(token, productId));
  if (purchase.state !== "purchased") return null;
  return verifyPlayPurchase({ token, productId, orderId: purchase.orderId, finish: () => store.finishTransaction(purchase) });
}

/**
 * What every purchase sheet is asked to close on. A purchase that arrives here is settled
 * like any other; one for the buy waiting on Google also answers it.
 */
function heardPurchase(purchase: StorePurchase) {
  void takePurchase(purchase);
  const buy = active;
  if (!buy || !purchase.token || !isThisBuy(purchase, buy)) return;
  buy.heard({ kind: "heard", token: purchase.token });
}

/**
 * How far Google's clock may run behind the phone's and a purchase with no intent on it
 * still count as new. Only such a purchase needs it: every one this app starts carries one.
 */
const CLOCK_SLACK_MS = 60_000;

/**
 * Whether a purchase is the one the waiting buy just made. Google answers an attempt on a
 * pack it still holds unfinished with that earlier purchase — this account's, or another
 * one's on the same Google account — so the pack and the account aren't enough: it must
 * carry this buy's intent. One carrying none (bought outside the app) counts only when
 * plainly made after the sheet opened.
 */
function isThisBuy(purchase: StorePurchase, buy: { productId: string; intentId: string; since: number }): boolean {
  if (purchase.productId !== buy.productId || !isOurs(purchase.accountId)) return false;
  if (purchase.profileId) return purchase.profileId === buy.intentId;
  return purchase.purchasedAt !== null && purchase.purchasedAt >= buy.since - CLOCK_SLACK_MS;
}

/** A failure only means something to the buy waiting on Google; the sheet's answer says the same. */
function heardFailure(failure: StoreFailure) {
  active?.heard(failure);
}

type Heard = { kind: "heard"; token: string } | StoreFailure;

/** What C28 does next. */
export type BuyResult =
  /** A purchase came back: C29 follows it (verifying, granted, pending…). */
  | { kind: "bought"; token: string }
  | { kind: "cancelled" }
  /** Google already holds an unfinished purchase of this pack: what became of it. */
  | { kind: "owned"; notice: OwnedNotice }
  | { kind: "failed"; message: string }
  /** The sheet closed and no purchase came back. If one was made, a reconcile will find it. */
  | { kind: "no-answer" };

export type OwnedNotice = "added" | "pending" | "otherAccount" | "unknown";

/**
 * C28 · Buy: the intent from the server, then Google's purchase sheet carrying its ids.
 * Throws only before the sheet opens (the intent refused, Google Play unreachable) —
 * nothing has been paid then. The purchase sheet's own answer and Google's listener both
 * bring the purchase; whichever is first answers, and both hand it to the same
 * once-per-token verification.
 */
export async function buyPack(productId: string): Promise<BuyResult> {
  const intent = await billingApi.playIntent(productId);
  rememberPlayAccount(intent.obfuscatedAccountId, intent.previousObfuscatedAccountIds);
  await ensureConnection();

  let heard: (outcome: Heard) => void = () => {};
  const listened = new Promise<Heard>((resolve) => {
    heard = resolve;
  });
  const buy = { productId, intentId: intent.intentId, since: Date.now(), heard: (outcome: Heard) => heard(outcome) };
  active = buy;
  // Sign-out while the sheet is open: nothing more is waited for.
  const stopWaiting = onPlayReset(() => heard({ kind: "failed", code: null }));
  try {
    const asked = store
      .requestPurchase({ productId, obfuscatedAccountId: intent.obfuscatedAccountId, obfuscatedProfileId: intent.obfuscatedProfileId })
      .then((outcome: BuyOutcome) => {
        // Settled even when the listener answered first: the same token is asked about once.
        if (outcome.kind === "purchases") for (const p of outcome.purchases) void takePurchase(p);
        return outcome;
      });
    let outcome: BuyOutcome | Heard = await Promise.race([asked, listened]);
    if (outcome.kind === "purchases") {
      const ofPack = outcome.purchases.filter((p) => p.token && p.productId === productId);
      const mine = ofPack.find((p) => isThisBuy(p, buy));
      if (mine?.token) return { kind: "bought", token: mine.token };
      // Only an earlier purchase came back: Google wouldn't sell the pack again, and nothing was paid now.
      if (ofPack.length > 0) return { kind: "owned", notice: await ownedNotice(ofPack) };
      const late = await Promise.race([listened, wait(LATE_PURCHASE_MS).then((): null => null)]);
      if (!late) return { kind: "no-answer" };
      outcome = late;
    }
    return await resultOf(outcome, productId, intent.intentId);
  } finally {
    if (active === buy) active = null;
    stopWaiting();
  }
}

async function resultOf(outcome: Heard, productId: string, intentId: string): Promise<BuyResult> {
  switch (outcome.kind) {
    case "heard":
      return { kind: "bought", token: outcome.token };
    case "cancelled":
      if (!abandoned.has(intentId)) {
        abandoned.add(intentId);
        void billingApi.reportCheckout(intentId, { status: "ABANDONED", pageUrl: PAGE });
      }
      return { kind: "cancelled" };
    case "already-owned":
      return { kind: "owned", notice: await settleOwned(productId) };
    default:
      return { kind: "failed", message: t("checkout.playFailed") };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Google won't sell a pack again while an earlier purchase of it is unfinished, and had
 * none to answer with: look it up and settle it now.
 */
async function settleOwned(productId: string): Promise<OwnedNotice> {
  let held: StorePurchase[];
  try {
    held = (await store.getAvailablePurchases()).filter((p) => p.productId === productId && p.token);
  } catch {
    return "unknown";
  }
  return ownedNotice(held);
}

/**
 * What became of the earlier purchases Google holds of a pack, each asked about once.
 * Granted: added, and the pack can be bought again. Still pending with Google, or another
 * account's: said so — it clears once that purchase is settled.
 */
async function ownedNotice(held: StorePurchase[]): Promise<OwnedNotice> {
  if (held.some((p) => !isOurs(p.accountId))) return "otherAccount";
  const answers = await Promise.all(held.map((p) => takePurchase(p)));
  const kinds = new Set(answers.map((a) => a?.kind));
  if (kinds.has("otherAccount")) return "otherAccount";
  if (kinds.has("pending")) return "pending";
  if (kinds.has("granted")) return "added";
  return "unknown";
}

/** The sentence C28 says for an owned pack. */
export function ownedMessage(notice: OwnedNotice): string {
  switch (notice) {
    case "added":
      return t("checkout.playOwnedAdded");
    case "pending":
      return t("checkout.playOwnedPending");
    case "otherAccount":
      return t("checkout.playOwnedOtherAccount");
    default:
      return t("checkout.playOwnedUnknown");
  }
}

/**
 * Everything Google still holds unfinished for this phone, handed over: a purchase the app
 * was closed in the middle of, one that finished paying while it was away, one whose
 * answer never got through. One at a time; a token already answered in this run, a pending
 * one and another account's are left alone.
 */
export function reconcilePlay(): Promise<void> {
  reconciling ??= (async () => {
    try {
      const catalogue = await queryClient.fetchQuery({ ...playCatalogueQuery, staleTime: 60_000 });
      if (!catalogue.enabled) return;
      await ensureConnection();
      const held = await store.getAvailablePurchases();
      await Promise.all(held.map((p) => (p.token && !isSettled(p.token) ? takePurchase(p) : null)));
    } catch {
      // Tried again on the next return to the app; the purchases stay with Google meanwhile.
    } finally {
      reconciling = null;
    }
  })();
  return reconciling;
}

/**
 * The customer's screens are up (PlayPurchaseWatcher): listen for every purchase Google
 * reports, and hand over what it already holds. Returns the stop, which also ends the
 * connection; sign-out (resetPlay) removes the listeners too.
 */
export function startPlay(): () => void {
  const subscriptions: { remove: () => void }[] = [];
  try {
    subscriptions.push(store.onPurchase(heardPurchase), store.onError(heardFailure));
  } catch {
    // No Google Play billing in this app (Expo Go has no native module for it). The
    // customer's screens carry on; only Checkout says Google Play can't be reached.
    for (const s of subscriptions) s.remove();
    subscriptions.length = 0;
  }
  let stopped = false;
  const stopListening = () => {
    if (stopped) return;
    stopped = true;
    for (const s of subscriptions) s.remove();
  };
  const forget = onPlayReset(stopListening);
  void reconcilePlay();
  return () => {
    stopListening();
    forget();
    if (connection) {
      connection = null;
      void store.endConnection().catch(() => {});
    }
  };
}
