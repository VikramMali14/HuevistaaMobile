/**
 * Response and request shapes. They mirror the backend DTOs (VikramMali14/HueVista) and
 * the website's copies in HueVistaFrontEnd/src/lib/types.ts. Add types here as each
 * screen needs them — Swagger (/swagger-ui.html) is the source of truth.
 */

/** Must match the backend UserRole enum exactly (auth/model/UserRole.java). */
export type UserRole = "ADMIN" | "DISTRIBUTOR" | "RETAILER" | "PAINTER" | "CUSTOMER";
export type AuthProvider = "LOCAL" | "GOOGLE" | "ACCESS_CODE";

/** GET /api/auth/profile — and `user` inside every AuthResponse. */
export interface UserProfile {
  id: string;
  name: string;
  /** Absent for accounts opened with a shop's access code. */
  email?: string | null;
  picture?: string | null;
  provider: AuthProvider;
  role: UserRole;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  /** False for Google accounts and passwordless (mobile / walk-in) accounts. */
  hasPassword?: boolean;
  /** Still wearing the placeholder name a mobile sign-up is born with. */
  namePending?: boolean;
  /** Never shown around the app — drives the first run (A10/A11). */
  welcomePending?: boolean;
  /** A shop's customer profile: no sign-in of its own, reached by switching. */
  linkedProfile?: boolean;
  /** A shop only: whether its customer profile is switched on. */
  customerProfileEnabled?: boolean | null;
  /** What this session can switch to right now. */
  switchTo?: "CUSTOMER" | "SHOP" | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Every sign-in endpoint answers with this. Tokens are absent when a second step is needed. */
export interface AuthResponse {
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenType?: "Bearer";
  /** Access token lifetime in seconds (900). */
  expiresIn?: number;
  user?: UserProfile | null;
  /** Admin accounts: an emailed code is required. The app sends admins to the website. */
  twoFactorRequired?: boolean | null;
  /** A shop on a new device: finish at POST /api/auth/login/email-code (A8). */
  emailCodeRequired?: boolean | null;
  challengeToken?: string | null;
  /** Where the code went, masked: s***@example.com */
  emailHint?: string | null;
  /** Issued once a shop's emailed code is confirmed; skips the code for 30 days. */
  deviceToken?: string | null;
  deviceTokenExpiresIn?: number | null;
  /** A shop with its customer profile on: ask which of the two to continue as. */
  chooseProfile?: boolean | null;
}

/** POST /api/auth/phone/start. The same answer whether or not the number has an account. */
export interface PhoneCodeSent {
  /** Masked: *********3210 */
  phone: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

/** POST /api/auth/verify/{email|phone}/send */
export interface VerificationStatus {
  channel: "EMAIL" | "PHONE" | "PHONE_MOVE";
  destination: string;
  expiresInSeconds: number;
  cooldownSeconds: number;
}

/** The backend's error body (GlobalExceptionHandler). */
export interface ErrorBody {
  status?: number;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Machine-readable hint, e.g. AUTO_MASK_UNAVAILABLE. */
  code?: string;
}
