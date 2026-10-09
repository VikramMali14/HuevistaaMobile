import * as Location from "expo-location";

import { searchPoint, type SearchPoint } from "./nearby";

/**
 * Where the phone is, for one search (C32) — asked only when the customer presses for it,
 * or straight away when they've already said yes. Never kept: the point lives in the
 * screen and the in-memory cache, nowhere else.
 */
export type Located =
  | { kind: "fix"; point: SearchPoint }
  /** `settings`: refused for good — only the phone's settings can change it now. */
  | { kind: "denied"; settings: boolean }
  /** Location (GPS) is off on the phone. */
  | { kind: "off" }
  | { kind: "failed" };

/** As the website: a fix a minute old will do, and fifteen seconds is long enough to wait. */
const RECENT_MS = 60_000;
const WAIT_MS = 15_000;

/** Whether permission was given before — so the search can start without a question. */
export async function alreadyAllowed(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function locate(): Promise<Located> {
  try {
    const asked = await Location.requestForegroundPermissionsAsync();
    if (!asked.granted) return { kind: "denied", settings: !asked.canAskAgain };
    const on = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!on) return { kind: "off" };
    const recent = await Location.getLastKnownPositionAsync({ maxAge: RECENT_MS }).catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fix =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), WAIT_MS);
        }),
      ]).finally(() => clearTimeout(timer)));
    const point = fix ? searchPoint(fix.coords.latitude, fix.coords.longitude) : null;
    return point ? { kind: "fix", point } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
