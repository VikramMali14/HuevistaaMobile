import * as Crypto from "expo-crypto";

import { isApiError } from "@/api/errors";
import { formatMobileForDisplay, isIndianMobile } from "@/lib/validation";

/**
 * P9's redemption key. Redeeming spends points inside the one request; the key is how a
 * retry gets the SAME redemption back instead of a second one. The server answers a reused
 * key with the original redemption even for a different item — so a key belongs to one
 * screen's one item, is kept across every retry of it (an answer that never came back
 * included), and is let go only once a redemption has come back.
 */
export class RequestKey {
  private key: string | null = null;

  /** The key for this attempt — the same one until `settled()`. */
  current(): string {
    this.key ??= newRequestKey();
    return this.key;
  }

  /** A redemption came back: the next press is a new redemption. */
  settled() {
    this.key = null;
  }
}

export function newRequestKey(): string {
  try {
    const id: unknown = Crypto.randomUUID();
    if (typeof id === "string" && id) return id;
  } catch {
    // Made below instead.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** No answer (no connection, a timeout, a server fault): it may have gone through. */
export function isUnanswered(err: unknown): boolean {
  return !isApiError(err) || err.kind !== "http" || err.status >= 500;
}

/** "+91 98765 43210" for a confirmed Indian mobile; anything else as the server wrote it. */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  // Non-breaking spaces: a number read out to a caller shouldn't wrap across two lines.
  return isIndianMobile(e164) ? `+91 ${formatMobileForDisplay(e164)}`.replace(/ /g, "\u00a0") : e164;
}
