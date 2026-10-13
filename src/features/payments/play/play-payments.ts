import { useSyncExternalStore } from "react";

import { billingApi } from "@/api/endpoints/billing";
import { isApiError, messageFor } from "@/api/errors";
import { paymentChanges } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";

/**
 * What became of each Google Play purchase in this run (C28 → C29 in the Android store
 * build) — 07 "Payments", "Google Play". Keyed by the purchase token, which is what the
 * server reads the purchase by. The Razorpay store beside it (payments.ts) is untouched:
 * nothing here goes through the website or keeps a proof on the phone, because Google
 * keeps every unfinished purchase itself and hands it back on the next reconcile.
 *
 * Money is never decided on the phone. Only the server, which reads the purchase from
 * Google, says it was granted; until it says so for good, the answer is "pending" (Google
 * is waiting for the money) or "checking" (we couldn't ask yet), and a purchase is only
 * consumed once the server has granted it.
 *
 * This module doesn't import the store adapter (and so not expo-iap), so sign-out can
 * reset it from anywhere: whoever finishes a purchase hands its `finish` in.
 */
export type PlayPurchaseState =
  | { kind: "verifying"; token: string; productId: string }
  /** Granted. `rooms`/`credits` are what the purchase added, every unit counted. */
  | { kind: "granted"; token: string; productId: string; rooms: number; credits: number; reference: string | null }
  /** Google is still waiting for the money (a cash or slow payment): nothing added yet. */
  | { kind: "pending"; token: string; productId: string }
  /** Not yet answered — no signal, a slow server. Tried again; never "failed", never a Buy button. */
  | { kind: "checking"; token: string; productId: string; message: string }
  /** The server refused it for good: its sentence, and why. */
  | { kind: "refused"; token: string; productId: string; message: string; reason: string | null }
  /** The purchase belongs to another HueVistaa account: left alone, never consumed here. */
  | { kind: "otherAccount"; token: string; productId: string };

/** A purchase to hand the server: its token and pack, and how to consume it once granted. */
export interface PlayPurchaseInput {
  token: string;
  productId: string;
  /** Google's order id, when the phone was given one — shown until the server's reference is known. */
  orderId?: string | null;
  finish?: () => Promise<void>;
}

const states = new Map<string, PlayPurchaseState>();
const verifies = new Map<string, Promise<PlayPurchaseState>>();
/** How each token is finished, and its order id: kept so Check again can do the same. */
const inputs = new Map<string, PlayPurchaseInput>();
/** Tokens the server answered for good in this run: a reconcile leaves them alone. */
const settled = new Set<string>();
const listeners = new Set<() => void>();
/** What sign-out must also stop: the purchase listeners, the buy waiting on Google. */
const cleanups = new Set<() => void>();
/** This account's id on Google's side, from GET /products or an intent (what a buy is stamped with). */
let account: string | null = null;
/**
 * Every id this account is known by on Google's side: the current one and those made with
 * an obfuscation secret the server has since rotated away from. A purchase stamped before
 * the rotation still carries an old one, and is still this account's.
 */
const accounts = new Set<string>();
/** Counts resets, so an answer that arrives after sign-out is dropped. */
let generation = 0;

function set(state: PlayPurchaseState): PlayPurchaseState {
  states.set(state.token, state);
  for (const l of listeners) l();
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function playPurchaseState(token: string): PlayPurchaseState | null {
  return states.get(token) ?? null;
}

export function usePlayPurchase(token: string): PlayPurchaseState | null {
  return useSyncExternalStore(subscribe, () => states.get(token) ?? null, () => states.get(token) ?? null);
}

/** A purchase is being confirmed (C28 keeps Buy off meanwhile, so nothing is bought twice). */
function anyBusy(): boolean {
  for (const s of states.values()) if (s.kind === "verifying" || s.kind === "checking") return true;
  return false;
}

export function usePlayBusy(): boolean {
  return useSyncExternalStore(subscribe, anyBusy, anyBusy);
}

/** Google's order id for a purchase, when the phone has one (for C29's reference line). */
export function playOrderId(token: string): string | null {
  return inputs.get(token)?.orderId ?? null;
}

/**
 * This account's id on Google's side, and the ids it had under earlier secrets: a purchase
 * carrying any other is someone else's. Ids add up until sign-out — every one is this account's.
 */
export function rememberPlayAccount(id: string | null | undefined, previous?: readonly string[] | null) {
  if (id) {
    account = id;
    accounts.add(id);
  }
  for (const old of previous ?? []) if (old) accounts.add(old);
}

export function playAccount(): string | null {
  return account;
}

/**
 * Whether a purchase may be sent under this session. One carrying another account's id is
 * never sent — its token is that account's business. One carrying none (a promo code
 * redeemed in the Play Store) is sent, and the server decides. One carrying an id while
 * this account's is not known yet waits for a reconcile that knows it. Any of this account's
 * ids counts, an old one too (a purchase made before the server rotated its secret).
 */
export function isOurs(purchaseAccountId: string | null | undefined): boolean {
  if (!purchaseAccountId) return true;
  return accounts.has(purchaseAccountId);
}

/** Answered for good in this run: a reconcile or a second delivery leaves it alone. */
export function isSettled(token: string): boolean {
  return settled.has(token);
}

/** Google says it's still waiting for the money. Nothing is sent: only a purchased one is. */
export function markPending(token: string, productId: string): PlayPurchaseState {
  const known = states.get(token);
  if (known && known.kind !== "pending" && known.kind !== "checking") return known;
  return set({ kind: "pending", token, productId });
}

/**
 * What an error from POST /purchases means. OTHER_ACCOUNT: someone else's, for good. No
 * answer, a 5xx, 401, 408 or 429: not an answer — checked again. Any other 4xx: the
 * server read the purchase (or the request) and said no for good.
 */
export function classifyPlayError(err: unknown): "otherAccount" | "checking" | "refused" {
  if (isApiError(err) && err.code === "OTHER_ACCOUNT") return "otherAccount";
  if (!isApiError(err) || err.kind !== "http") return "checking";
  if (err.status >= 500 || [401, 408, 429].includes(err.status)) return "checking";
  return err.status >= 400 ? "refused" : "checking";
}

/**
 * Hand a purchase to the server. One request per token at a time: the same purchase can
 * reach the phone three ways at once (the purchase sheet's answer, Google's listener and
 * a reconcile), and they share it. Granted: consumed (a failure to consume is harmless —
 * the server consumes it too) and the balances read again. Calling again for a token
 * that's checking tries again; for a settled one it answers what's known.
 */
export function verifyPlayPurchase(input: PlayPurchaseInput): Promise<PlayPurchaseState> {
  const { token, productId } = input;
  const running = verifies.get(token);
  if (running) return running;
  const done = states.get(token);
  if (done && settled.has(token)) return Promise.resolve(done);
  const known = inputs.get(token);
  inputs.set(token, { token, productId, orderId: input.orderId ?? known?.orderId ?? null, finish: input.finish ?? known?.finish });
  const run0 = generation;

  // Checking again keeps saying "checking" (the screen's own button shows it is busy).
  if (done?.kind !== "checking") set({ kind: "verifying", token, productId });
  const run = billingApi
    .playPurchase({ productId, purchaseToken: token })
    .then((answer): PlayPurchaseState => {
      // Signed out meanwhile: the answer belongs to an account that's gone.
      if (run0 !== generation) return { kind: "checking", token, productId, message: "" };
      if (answer.status === "PENDING") return set({ kind: "pending", token, productId });
      settled.add(token);
      const state = set({
        kind: "granted",
        token,
        productId,
        rooms: answer.projects,
        credits: answer.credits,
        reference: answer.reference ?? null,
      });
      void consume(token);
      // Said first; the balances catch up behind it.
      for (const queryKey of paymentChanges) void queryClient.invalidateQueries({ queryKey }).catch(() => {});
      return state;
    })
    .catch((err: unknown): PlayPurchaseState => {
      if (run0 !== generation) return { kind: "checking", token, productId, message: "" };
      const kind = classifyPlayError(err);
      if (kind === "checking") return set({ kind, token, productId, message: messageFor(err) });
      settled.add(token);
      if (kind === "otherAccount") return set({ kind, token, productId });
      return set({ kind, token, productId, message: messageFor(err), reason: isApiError(err) ? (err.reason ?? null) : null });
    })
    .finally(() => {
      if (verifies.get(token) === run) verifies.delete(token);
    });
  verifies.set(token, run);
  return run;
}

/** Try a checking purchase again (C29's timer and Check again). */
export function checkPlayPurchaseAgain(token: string): Promise<PlayPurchaseState> | null {
  const input = inputs.get(token);
  return input ? verifyPlayPurchase(input) : null;
}

async function consume(token: string) {
  try {
    await inputs.get(token)?.finish?.();
  } catch {
    // The server consumes a granted purchase itself; the phone's try is only a second chance.
  }
}

/** Something sign-out must stop as well (a listener, a buy waiting on Google). */
export function onPlayReset(cleanup: () => void): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

/** Forget every Play purchase of this run and stop listening (sign-out, a switch of profile). */
export function resetPlay() {
  const pending = [...cleanups];
  cleanups.clear();
  for (const cleanup of pending) {
    try {
      cleanup();
    } catch {
      // A listener that's already gone.
    }
  }
  states.clear();
  verifies.clear();
  inputs.clear();
  settled.clear();
  account = null;
  accounts.clear();
  generation += 1;
  for (const l of listeners) l();
}
