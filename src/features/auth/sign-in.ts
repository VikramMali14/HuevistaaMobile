import type { AuthResponse, UserProfile } from "@/api/types";
import { secureTokenStore } from "@/auth/token-store";

/**
 * What a sign-in answer means for the next screen. Every sign-in path (mobile code,
 * email, Google, a shop switching to its customer profile) ends in one of these.
 */
export type SignInOutcome =
  /** Tokens arrived and the session is open — the (auth) layout moves the person on. */
  | { kind: "signedIn"; profile: UserProfile }
  /** A shop on a new device: confirm the emailed code (A8). */
  | { kind: "emailCode"; challengeToken: string; emailHint: string | null }
  /** An admin account: the app does not handle admin sign-in. */
  | { kind: "admin" };

/**
 * Turn an AuthResponse into the next step. Saves the tokens (and a shop's trusted-device
 * token) through `completeSignIn` when they are present.
 */
export async function finishSignIn(
  response: AuthResponse,
  completeSignIn: (response: AuthResponse) => Promise<UserProfile>,
): Promise<SignInOutcome> {
  if (response.twoFactorRequired) return { kind: "admin" };
  if (response.emailCodeRequired && response.challengeToken) {
    return { kind: "emailCode", challengeToken: response.challengeToken, emailHint: response.emailHint ?? null };
  }
  if (response.accessToken && response.refreshToken) {
    return { kind: "signedIn", profile: await completeSignIn(response) };
  }
  throw new Error("The sign-in answer carried neither tokens nor a next step");
}

/**
 * The shop's trusted-device token, if this phone has one. Sent with every sign-in so a
 * shop is not asked for an emailed code again within 30 days (A8).
 */
export async function deviceToken(): Promise<string | undefined> {
  try {
    return (await secureTokenStore.readDeviceToken()) ?? undefined;
  } catch {
    return undefined;
  }
}
