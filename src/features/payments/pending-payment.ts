import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * The payment in progress, kept on the phone (07 "Payments" step 2). Android can stop the
 * app while the browser is open; when the result comes back on a cold start (D3), this
 * says which order it was and what was in the basket. A payment that went through but
 * could not be confirmed is kept with its proof, so it is checked again — and never paid
 * for twice — until the server confirms it or refuses it for good.
 */
export interface PendingPayment {
  /**
   * The account it was made by; another account never sees it. Empty when the proof came
   * back while signed out with no order kept (D3): it goes to the next account to sign in,
   * and the server, which checks the order is theirs, decides.
   */
  accountId: string;
  orderId: string;
  amountPaise: number;
  /** What the order hands over (packages unpacked). */
  rooms: number;
  credits: number;
  /** What was asked for — what Try again puts back in the basket. */
  basket?: { rooms: number; credits: number };
  startedAt: number;
  /** Set once Razorpay said it was paid: what verification needs. */
  paid?: { paymentId: string; signature: string };
}

const KEY = "hv.pendingPayment";
/** An unpaid order older than this is a checkout that was walked away from. */
const STALE_MS = 2 * 60 * 60_000;
/** A paid proof older than this was long since delivered by the server's own webhook. */
const PAID_STALE_MS = 7 * 24 * 60 * 60_000;

let current: PendingPayment | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function write(next: PendingPayment | null) {
  current = next;
  emit();
  void (next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => {});
}

function isPending(value: unknown): value is PendingPayment {
  const p = value as PendingPayment | null;
  return Boolean(p && typeof p.orderId === "string" && typeof p.accountId === "string");
}

function stale(p: PendingPayment, now: number): boolean {
  return now - p.startedAt > (p.paid ? PAID_STALE_MS : STALE_MS);
}

/** Read what an earlier run kept (once). A stale one is dropped. */
export function loadPending(now: number = Date.now()): Promise<PendingPayment | null> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (current) return;
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (!isPending(stored)) return;
      if (stale(stored, now)) {
        write(null);
        return;
      }
      current = stored;
      emit();
    })
    .catch(() => {});
  return loaded.then(() => current);
}

export function savePending(payment: PendingPayment) {
  loaded ??= Promise.resolve();
  write(payment);
}

/**
 * Razorpay said paid: keep the proof until the server confirms it. With no order of this
 * id kept (a cold start after the order was forgotten), the proof is kept on its own —
 * for `accountId`, or for whoever signs in next when that is not known.
 */
export function markPaid(orderId: string, paid: { paymentId: string; signature: string }, accountId?: string) {
  if (current?.orderId === orderId) {
    write({ ...current, paid });
    return;
  }
  write({ accountId: accountId ?? "", orderId, amountPaise: 0, rooms: 0, credits: 0, startedAt: Date.now(), paid });
}

/** The order is settled — confirmed, cancelled, refused — so nothing is waiting. */
export function clearPending(orderId?: string) {
  if (orderId && current && current.orderId !== orderId) return;
  write(null);
}

export function peekPending(): PendingPayment | null {
  return current;
}

/** Whether a kept payment belongs to this account (or to whoever signs in next). */
export function pendingIsFor(p: PendingPayment | null, accountId: string | null | undefined): p is PendingPayment {
  return Boolean(p && accountId && (p.accountId === accountId || p.accountId === ""));
}

/** A payment of this account that went through and is not yet confirmed (C27, C28). */
export function usePaidButUnconfirmed(accountId: string | null | undefined): PendingPayment | null {
  void loadPending();
  const p = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  return p?.paid && pendingIsFor(p, accountId) ? p : null;
}

/**
 * Sign-out, or a switch of profile. An unpaid order goes; a paid proof stays, because the
 * money has left and only a confirmation can settle it — it is shown to its own account
 * only (or, kept while signed out, to the next one to sign in).
 */
export async function resetPending(): Promise<void> {
  await loadPending();
  if (current && !current.paid) write(null);
}
