import { api } from "../instance";

/**
 * Push notifications (Phase 8): the phone's Expo push token, kept against the signed-in
 * account so the server can say when walls or an AI image are ready, a voucher is settled
 * or the team has replied. Registering again is harmless, and a token another account had
 * on this phone moves to this one. The server drops a phone's tokens itself on sign-out,
 * a password change and account deletion — the phone can't always say so in time.
 */
export interface PushRegistration {
  /** "ExponentPushToken[…]". */
  token: string;
  platform: "ANDROID" | "IOS";
  /** The language the server writes this phone's notifications in. */
  locale: "en" | "hi";
  appVersion: string;
}

export const pushApi = {
  /** POST /api/me/push-tokens → 204. */
  register: (body: PushRegistration) =>
    api.request<void>("api/me/push-tokens", { method: "POST", body, timeoutMs: 10_000 }),

  /** DELETE /api/me/push-tokens?token= → 204, whether or not it was there. */
  unregister: (token: string) =>
    api.request<void>("api/me/push-tokens", { method: "DELETE", query: { token }, timeoutMs: 3_000 }),
};
