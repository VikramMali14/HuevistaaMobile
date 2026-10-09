import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { mobileVersionApi, type MobileVersions, type PlatformVersion } from "@/api/endpoints/mobile-version";
import { appVersion } from "@/lib/app-version";

/**
 * X5 · Update needed. The server names the oldest version still allowed on each store
 * (GET /api/mobile/version). Its last answer is kept on the phone and read at start-up —
 * so the check never waits on the network — and a fresh answer is fetched behind it and
 * kept for the NEXT start: a raised minimum never stops someone part-way through a room
 * or a board. Anything that fails — no network, an older server, a malformed answer —
 * blocks nothing. And it never blocks without a store to send people to.
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
  /** This version is older than the minimum, and there's a store to update from. */
  blocked: boolean;
  /** A newer version is out (not required). */
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
  return { blocked: belowMin && storeUrl !== null, updateAvailable: belowLatest && storeUrl !== null, storeUrl };
}

let gate: VersionGate = OPEN;

export function versionGate(): VersionGate {
  return gate;
}

/** At start-up: the kept answer decides now; a fresh one is fetched and kept for next time. */
export async function loadVersionGate(): Promise<void> {
  if (Platform.OS === "web") return;
  const current = appVersion().version;
  try {
    const kept = await AsyncStorage.getItem(CACHE_KEY);
    gate = gateFor(kept ? (JSON.parse(kept) as MobileVersions) : null, current);
  } catch {
    gate = OPEN;
  }
  void mobileVersionApi
    .versions()
    .then((fresh) => (fresh && typeof fresh === "object" ? AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)) : undefined))
    .catch(() => {});
}
