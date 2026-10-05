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

// ── Balance (docs/04 "The rooms balance") ─────────────────────────────────────

/** GET /api/me/entitlement — the rooms a shop's code gave. An empty 200 means no shop. */
export interface CustomerEntitlement {
  customerId: string;
  customerName: string;
  retailerOrgId?: string | null;
  projectAllowance: number;
  projectsCreated: number;
  projectsRemaining: number;
  updatedAt?: string;
}

/** GET /api/billing/points/project-options — rooms bought outright, and their price. */
export interface ProjectPurchaseOptions {
  subscribed: boolean;
  projectPricePoints: number;
  /** Paise. */
  projectPricePaise: number;
  bundleCredits?: number;
  bundlePricePaise?: number;
  bundleAiCredits?: number;
  pointsBalance: number;
  pointsEligible?: boolean;
  /** How long a room stays open. */
  validDays: number;
  /** Rooms bought and not yet started. */
  availableCredits: number;
}

/** GET /api/billing/ai-credits — the AI credit wallet. */
export interface AiCreditSummary {
  balance: number;
  /** False when this account cannot hold AI credits — hide the figure, never show 0. */
  eligible: boolean;
  pricePaise: number;
  listPricePaise: number;
  discountPercent: number;
  minPurchase: number;
  maxPurchase: number;
  renderCost: number;
  soonestExpiryAt?: string | null;
  expiringCredits?: number;
  currency: string;
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export type ProjectStatus = "CREATED" | "SEGMENTING" | "SEGMENTED" | "FAILED";

/** GET /api/projects (one row). */
export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  imageId: string;
  imageUrl: string;
  cleanedImageUrl?: string | null;
  regionCount: number;
  createdAt?: string;
  updatedAt?: string;
  source?: "OWN" | "CUSTOMER";
  hasShareLink?: boolean;
  /** Its time ran out: it can be looked at, not painted. */
  readOnly?: boolean;
  fromLibrary?: boolean;
  accessExpiresAt?: string | null;
  /** A colour board was taken (or the room was closed): it is finished. */
  closedAt?: string | null;
}

export type RenderStatus = "QUEUED" | "RUNNING" | "READY" | "FAILED";

/** GET /api/me/renders (one row) — an AI image. */
export interface MyRender {
  id: string;
  projectId: string;
  projectName: string;
  roomType?: string | null;
  status: RenderStatus;
  imageUrl?: string | null;
  createdAt?: string;
  completedAt?: string | null;
}

/** GET /api/free-projects (one row) — a ready-made room the team published. */
export interface FreeProject {
  slug: string;
  title: string;
  description?: string | null;
  /** INTERIOR or EXTERIOR. */
  space?: string | null;
  roomLabel?: string | null;
  imageUrl: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  wallCount: number;
  colours?: { label?: string | null; hex: string; shadeCode?: string | null }[] | null;
  publishedAt?: string | null;
}

/** POST /api/free-projects/{slug}/start — the caller's own copy. */
export interface StartedFreeProject {
  projectId: string;
  name: string;
  status: string;
  regionCount: number;
}

// ── Shades ────────────────────────────────────────────────────────────────────

/** GET /api/shades/mine/brands — the companies this account may browse. */
export interface ShadeBrandSummary {
  name: string;
  slug: string;
  shadeCount: number;
}

/** GET /api/shades/{brand}/{code} — one shade, in full. */
export interface ShadeDetail {
  brandName?: string | null;
  brandSlug?: string | null;
  shadeCode?: string;
  hvCode?: string | null;
  name?: string | null;
  hexCode?: string;
  shadeFamily?: string | null;
  lrv?: number | string | null;
  colorTemperature?: string | null;
  tonality?: string | null;
  suitableRooms?: string[] | null;
  finishRecommendations?: string[] | null;
  aiDescription?: string | null;
}

// ── Shops ─────────────────────────────────────────────────────────────────────

/** POST /api/access-codes/redeem — the code, now on this account. */
export interface RedeemedCode {
  id: string;
  code: string;
  organizationId: string;
  organizationName?: string | null;
  validDays?: number;
  projectQuota?: number;
  projectsRemaining?: number;
}

export interface ShopProduct {
  id: string;
  lineId: number;
  brandName?: string | null;
  lineName?: string | null;
  category?: string | null;
  /** Rupees, as the shop typed it. */
  price?: number | null;
  priceUnit?: string | null;
  packSize?: string | null;
  coverage?: string | null;
  finish?: string | null;
  description?: string | null;
}

/** GET /api/me/assigned-products — what each shop behind this account unlocked. */
export interface AssignedProducts {
  shops: {
    shopId: string;
    shopName: string;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    openingHours?: string | null;
    allowedBrands?: string[];
    products: ShopProduct[];
  }[];
}
