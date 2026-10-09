import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { mobileVersionApi, type MobileVersions, type PlatformVersion } from "@/api/endpoints/mobile-version";
import { appVersion } from "@/lib/app-version";

/**
 * X5 · Update needed. The server names the oldest version still allowed on each store
 * (GET /api/mobile/version). Its last answer is kept on the phone and read at start-up —
 * so the check never waits on the network — and a fresh answer is fetched behind it and
 * kept. The server is asked again whenever the app comes back from the background, and
 * that answer decides at once: a raised minimum never cuts in while someone is using the
 * app, only when they return to it — and a phone that never closes the app is still
 * caught. Anything that fails — no network, an older server, a malformed answer — blocks
 * nothing. A retired version is blocked even with no store link (iOS has none until it is
 * listed): the screen then names the store instead of opening it.
 */
const CACHE_KEY = "hv.minVersion";

const VERSION = /^\d+(\.\d+){0,2}$/;

/** -1, 0 or 1, comparing "1.2.3"-style versions part by part (a missing part is 0). Null if either won't read. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  if (!VERSION.test(a.trim()) || !VERSION.test(b.trim())) return null;
  const x = a.trim().split(".").map(Number);
  const y = b.trim().split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface VersionGate {
  /** This version is older than the minimum. */
  blocked: boolean;
  /** A newer version is out (not required), and there's a store to update from. */
  updateAvailable: boolean;
  storeUrl: string | null;
}

const OPEN: VersionGate = { blocked: false, updateAvailable: false, storeUrl: null };

function platformAnswer(answer: MobileVersions | null): PlatformVersion | null {
  if (!answer || typeof answer !== "object") return null;
  if (Platform.OS === "android") return answer.android ?? null;
  if (Platform.OS === "ios") return answer.ios ?? null;
  return null;
}

/** What an answer means for `current`. */
export function gateFor(answer: MobileVersions | null, current: string): VersionGate {
  const mine = platformAnswer(answer);
  if (!mine) return OPEN;
  const storeUrl = typeof mine.storeUrl === "string" && /^https:\/\//.test(mine.storeUrl) ? mine.storeUrl : null;
  const belowMin = typeof mine.minimumVersion === "string" ? compareVersions(current, mine.minimumVersion) === -1 : false;
  const belowLatest = typeof mine.latestVersion === "string" ? compareVersions(current, mine.latestVersion) === -1 : false;
  return { blocked: belowMin, updateAvailable: belowLatest && storeUrl !== null, storeUrl };
}

let gate: VersionGate = OPEN;
const listeners = new Set<() => void>();

function setGate(next: VersionGate) {
  if (next.blocked === gate.blocked && next.updateAvailable === gate.updateAvailable && next.storeUrl === gate.storeUrl) return;
  gate = next;
  for (const listener of listeners) listener();
}

export function versionGate(): VersionGate {
  return gate;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The gate now, re-rendering when an answer changes it. */
export function useVersionGate(): VersionGate {
  return useSyncExternalStore(subscribe, versionGate, versionGate);
}

/** The answer kept on the phone, if one can be read. */
async function keptAnswer(): Promise<MobileVersions | null> {
  try {
    const kept = await AsyncStorage.getItem(CACHE_KEY);
    return kept ? (JSON.parse(kept) as MobileVersions) : null;
  } catch {
    return null;
  }
}

/** A fresh answer, kept on the phone. Null when there's none to be had. */
async function fetchFresh(): Promise<MobileVersions | null> {
  try {
    const fresh = await mobileVersionApi.versions();
    if (!fresh || typeof fresh !== "object") return null;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
    return fresh;
  } catch {
    return null;
  }
}

/** At start-up: the kept answer decides now; a fresh one is fetched and kept. */
export async function loadVersionGate(): Promise<void> {
  if (Platform.OS === "web") return;
  setGate(gateFor(await keptAnswer(), appVersion().version));
  void fetchFresh();
}

/**
 * Asks again each time the app comes back from the background, and lets the answer decide
 * at once. Offline, the answer kept at start-up decides; with none at all, the gate stays
 * as it was. Call once from the root layout; returns the unsubscribe.
 */
export function watchVersionGate(): () => void {
  if (Platform.OS === "web") return () => {};
  let away = false;
  const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next === "background") away = true;
    if (next !== "active" || !away) return;
    away = false;
    void (async () => {
      const answer = (await fetchFresh()) ?? (await keptAnswer());
      if (answer) setGate(gateFor(answer, appVersion().version));
    })();
  });
  return () => sub.remove();
}
