import { api } from "../instance";

/** One store's answer: the oldest version still allowed, the newest out, and where to get it. */
export interface PlatformVersion {
  minimumVersion: string | null;
  latestVersion: string | null;
  storeUrl: string | null;
}

export interface MobileVersions {
  android: PlatformVersion | null;
  ios: PlatformVersion | null;
}

export const mobileVersionApi = {
  /**
   * GET /api/mobile/version (X5) — public, so it's asked without the session: it answers
   * the same for everyone, and works before anyone signs in. Short wait: it must never
   * hold the app up.
   */
  versions: () => api.request<MobileVersions>("api/mobile/version", { auth: false, timeoutMs: 4_000 }),
};
