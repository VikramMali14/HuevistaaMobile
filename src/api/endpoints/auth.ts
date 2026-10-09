/**
 * /api/auth/** — signing in, the profile, and account security.
 * Backend: auth/controller/{AuthController,PhoneAuthController,VerificationController,
 * CustomerProfileController}.java. Screens: A2–A10, S2–S5, S9, S10.
 */
import { api } from "../instance";
import type { AuthResponse, PhoneCodeSent, UserProfile, VerificationStatus } from "../types";

const open = { auth: false } as const;

export const authApi = {
  // ── Signing in (no session yet) ──────────────────────────────────────────

  /** A3. Same answer whether or not the number has an account — never imply either. */
  phoneStart: (phone: string) =>
    api.request<PhoneCodeSent>("api/auth/phone/start", { ...open, body: { phone } }),

  /**
   * A4. A number the backend has never seen gets a new CUSTOMER account here. A number an
   * existing account holds unconfirmed answers 409 PHONE_ON_UNCONFIRMED_ACCOUNT and leaves
   * the code unspent; sent again with `notMyAccount: true`, the number comes off that
   * account and a new one is made as above.
   */
  phoneVerify: (body: { phone: string; code: string; name?: string; deviceToken?: string; notMyAccount?: boolean }) =>
    api.request<AuthResponse>("api/auth/phone/verify", { ...open, body }),

  /** A5. May answer emailCodeRequired (shops) or twoFactorRequired (admins) instead of tokens. */
  login: (body: { email: string; password: string; deviceToken?: string }) =>
    api.request<AuthResponse>("api/auth/login", { ...open, body }),

  /** A6. */
  register: (body: { name: string; email: string; password: string; phone?: string }) =>
    api.request<AuthResponse>("api/auth/register", { ...open, body }),

  /** A8. A shop's emailed code. Save the returned deviceToken. */
  shopEmailCode: (body: { challengeToken: string; code: string }) =>
    api.request<AuthResponse>("api/auth/login/email-code", { ...open, body }),

  shopEmailCodeResend: (challengeToken: string) =>
    api.request<AuthResponse>("api/auth/login/email-code/resend", {
      ...open,
      body: { challengeToken },
    }),

  /** A9. Trades the one-minute code from huevista://sign-in/callback#code=… for tokens. */
  exchangeGoogleCode: (code: string, deviceToken?: string) =>
    api.request<AuthResponse>("api/auth/oauth2/exchange", { ...open, body: { code, deviceToken } }),

  /** A7. Always "if an account uses this, we sent a code" — no account enumeration. */
  forgotPassword: (email: string) =>
    api.request<unknown>("api/auth/forgot-password", { ...open, body: { email } }),

  resetPassword: (body: { email: string; code: string; newPassword: string }) =>
    api.request<unknown>("api/auth/reset-password", { ...open, body }),

  forgotPasswordByPhone: (phone: string) =>
    api.request<unknown>("api/auth/forgot-password/phone", { ...open, body: { phone } }),

  resetPasswordByPhone: (body: { phone: string; code: string; newPassword: string }) =>
    api.request<unknown>("api/auth/reset-password/phone", { ...open, body }),

  // ── With a session ──────────────────────────────────────────────────────

  profile: () => api.request<UserProfile>("api/auth/profile"),

  updateProfile: (body: { name: string }) =>
    api.request<UserProfile>("api/auth/profile", { method: "PATCH", body }),

  /** The first run is over (A10/A11). */
  welcomeSeen: () => api.request<UserProfile>("api/auth/welcome/seen", { method: "POST" }),

  /** Revokes every refresh token on the account. */
  logout: () => api.request<unknown>("api/auth/logout", { method: "POST" }),

  /** S9. Permanent. */
  deleteAccount: () => api.request<unknown>("api/auth/account", { method: "DELETE" }),

  /** S5. Signs out every device, this one included. */
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.request<unknown>("api/auth/change-password", { body }),

  /** S5. The first password for a mobile / Google / walk-in account. */
  setPassword: (newPassword: string) =>
    api.request<unknown>("api/auth/set-password", { body: { newPassword } }),

  /** S3. */
  sendEmailCode: (email?: string) =>
    api.request<VerificationStatus>("api/auth/verify/email/send", { body: { email } }),

  confirmEmailCode: (code: string) =>
    api.request<UserProfile>("api/auth/verify/email/confirm", { body: { code } }),

  /** S4. */
  sendPhoneCode: (phoneNumber?: string) =>
    api.request<VerificationStatus>("api/auth/verify/phone/send", { body: { phoneNumber } }),

  confirmPhoneCode: (code: string) =>
    api.request<UserProfile>("api/auth/verify/phone/confirm", { body: { code } }),

  /** S10. A shop ⇄ its customer profile. May answer emailCodeRequired. */
  switchProfile: (body: { deviceToken?: string; refreshToken?: string }) =>
    api.request<AuthResponse>("api/auth/profiles/switch", { body }),
};
