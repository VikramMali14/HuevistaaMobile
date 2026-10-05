import * as WebBrowser from "expo-web-browser";

import { authApi } from "@/api/endpoints/auth";
import { isApiError } from "@/api/errors";
import type { AuthResponse } from "@/api/types";
import { deepLinks, env } from "@/config/env";

import { deviceToken } from "./sign-in";

/**
 * A9 · Google sign-in.
 *
 * 1. Open {API}/oauth2/authorization/google?client=mobile in the system browser.
 * 2. The backend answers huevista://sign-in/callback#code=… — a one-minute, single-use
 *    code in the fragment (never in the query, so it stays out of logs).
 * 3. Trade the code for tokens with POST /api/auth/oauth2/exchange.
 */
export const googleSignInUrl = `${env.apiOrigin}/oauth2/authorization/google?client=mobile`;

/** `code` / `error` from the fragment (or, defensively, the query) of a callback URL. */
export function parseAuthCallback(url: string | null | undefined): { code?: string; error?: string } {
  if (!url) return {};
  const hashAt = url.indexOf("#");
  const queryAt = url.indexOf("?");
  const raw =
    hashAt >= 0 ? url.slice(hashAt + 1) : queryAt >= 0 ? url.slice(queryAt + 1) : "";
  const out: { code?: string; error?: string } = {};
  for (const part of raw.split("&")) {
    const [key, value = ""] = part.split("=");
    if (!key) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      continue;
    }
    if (key === "code" && decoded) out.code = decoded;
    if (key === "error" && decoded) out.error = decoded;
  }
  return out;
}

/**
 * The code is single-use. On Android the redirect can reach the app twice — once to the
 * browser session that is waiting for it, and once as a deep link that opens
 * app/sign-in/callback.tsx — and exchanging it twice would fail the second time. So
 * both paths share one exchange per code.
 */
const exchanges = new Map<string, { promise: Promise<AuthResponse>; at: number }>();
/** A code dies after a minute; keep a little longer than that, then forget it. */
const KEEP_MS = 120_000;

export function exchangeGoogleCodeOnce(code: string): Promise<AuthResponse> {
  const now = Date.now();
  for (const [key, entry] of exchanges) if (now - entry.at > KEEP_MS) exchanges.delete(key);
  const existing = exchanges.get(code);
  if (existing) return existing.promise;
  const promise = deviceToken().then((device) => authApi.exchangeGoogleCode(code, device));
  exchanges.set(code, { promise, at: now });
  return promise;
}

export type GoogleResult =
  | { kind: "response"; response: AuthResponse }
  | { kind: "cancelled" }
  | { kind: "failed" };

/** The backend turned the code down (invalid, expired or already used) — start again. */
export function isRejectedGoogleCode(err: unknown): boolean {
  return isApiError(err) && err.kind === "http" && (err.status === 400 || err.status === 401);
}

/**
 * Run the whole browser round-trip. Never throws for a person closing the browser or a
 * code the backend turned down; a dropped connection still throws, so the caller can say
 * "No connection" instead of blaming Google.
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  const result = await WebBrowser.openAuthSessionAsync(googleSignInUrl, deepLinks.googleCallback);
  if (result.type !== "success") return { kind: "cancelled" };
  const { code, error } = parseAuthCallback(result.url);
  if (error || !code) return { kind: "failed" };
  try {
    return { kind: "response", response: await exchangeGoogleCodeOnce(code) };
  } catch (err) {
    if (isRejectedGoogleCode(err)) return { kind: "failed" };
    throw err;
  }
}
