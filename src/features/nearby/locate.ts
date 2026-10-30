import * as Location from "expo-location";

import { searchPoint, type SearchPoint } from "./nearby";

/**
 * Where the phone is, for one search (C32) or a painter's base (P5) — asked only when somebody
 * presses for it, or straight away when they've already said yes. Never kept by this module:
 * a search point lives in the screen and the in-memory cache, a painter's base goes to the
 * server rounded to a kilometre, and nothing is written down here.
 */
export type Located =
  | { kind: "fix"; point: SearchPoint }
  /** `settings`: refused for good — only the phone's settings can change it now. */
  | { kind: "denied"; settings: boolean }
  /** Location (GPS) is off on the phone. */
  | { kind: "off" }
  | { kind: "failed" };

/** A position as the phone gave it, before anything is rounded. */
export interface Fix {
  latitude: number;
  longitude: number;
  /** Metres, as the phone reports it; NaN when it gave none. */
  accuracy: number;
}

export type Found = { kind: "fix"; fix: Fix } | Exclude<Located, { kind: "fix" }>;

/** As the website: a fix a minute old will do, and fifteen seconds is long enough to wait. */
const RECENT_MS = 60_000;
const WAIT_MS = 15_000;
/** When the phone can't get a fresh fix in time, one from the last half hour beats none. */
const STALE_MS = 30 * 60_000;

/** Whether permission was given before — so the search can start without a question. */
export async function alreadyAllowed(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * The phone's position, with every way it can fail said apart: refused (and whether for good),
 * location switched off, or no answer in time. A fix from the last minute is used at once;
 * otherwise a fresh one gets fifteen seconds — Android's location service can take far longer
 * than that indoors, or never answer at all — and then the last one from the past half hour,
 * if there is one.
 */
export async function findFix(): Promise<Found> {
  try {
    const asked = await Location.requestForegroundPermissionsAsync();
    if (!asked.granted) return { kind: "denied", settings: !asked.canAskAgain };
    const on = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!on) return { kind: "off" };
    const recent = await Location.getLastKnownPositionAsync({ maxAge: RECENT_MS }).catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fresh =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), WAIT_MS);
        }),
      ]).finally(() => clearTimeout(timer)));
    const fix = fresh ?? (await Location.getLastKnownPositionAsync({ maxAge: STALE_MS }).catch(() => null));
    if (!fix) return { kind: "failed" };
    const accuracy = fix.coords.accuracy;
    return {
      kind: "fix",
      fix: {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : Number.NaN,
      },
    };
  } catch {
    return { kind: "failed" };
  }
}

/** Where to search from (C32): the phone's fix, rounded to about 100 m before it leaves the phone. */
export async function locate(): Promise<Located> {
  const found = await findFix();
  if (found.kind !== "fix") return found;
  const point = searchPoint(found.fix.latitude, found.fix.longitude);
  return point ? { kind: "fix", point } : { kind: "failed" };
}
