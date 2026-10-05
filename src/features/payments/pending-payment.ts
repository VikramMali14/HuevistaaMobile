import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * The payment in progress, kept on the phone (07 "Payments" step 2). Android can stop the
 * app while the browser is open; when the result comes back on a cold start (D3), this
 * says which order it was and what was in the basket. A payment that went through but
 * could not be confirmed is kept with its proof, so it is checked again — and never paid
 * for twice — until the server confirms it.
 */
export interface PendingPayment {
  /** The account it was made by; another account never sees it. */
  accountId: string;
  orderId: string;
  amountPaise: number;
  rooms: number;
  credits: number;
  startedAt: number;
  /** Set once Razorpay said it was paid: what verification needs. */
  paid?: { paymentId: string; signature: string };
}

const KEY = "hv.pendingPayment";
/** An unpaid order older than this is a checkout that was walked away from. */
const STALE_MS = 2 * 60 * 60_000;

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

/** Read what an earlier run kept (once). Unpaid and stale is dropped. */
export function loadPending(now: number = Date.now()): Promise<PendingPayment | null> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (current) return;
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (!isPending(stored)) return;
      if (!stored.paid && now - stored.startedAt > STALE_MS) {
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

/** Razorpay said paid: keep the proof until the server confirms it. */
export function markPaid(orderId: string, paid: { paymentId: string; signature: string }, accountId?: string) {
  if (current?.orderId === orderId) {
    write({ ...current, paid });
  } else if (accountId) {
    // A cold start with no order kept (cleared, or another phone's): keep the proof anyway.
    write({ accountId, orderId, amountPaise: 0, rooms: 0, credits: 0, startedAt: Date.now(), paid });
  }
}

/** The order is settled — confirmed, cancelled or refused — so nothing is waiting. */
export function clearPending(orderId?: string) {
  if (orderId && current && current.orderId !== orderId) return;
  write(null);
}

export function peekPending(): PendingPayment | null {
  return current;
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
  return p && p.paid && accountId && p.accountId === accountId ? p : null;
}

/** Forget it (sign-out: the next person's payments are their own). */
export function resetPending() {
  loaded = Promise.resolve();
  write(null);
}
