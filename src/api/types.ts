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

/** What a wall is in the scheme (backend project/model/RegionCategory). */
export type RegionCategory = "MAIN_WALL" | "ACCENT_WALL" | "OTHER_WALL" | "TRIM" | "CEILING" | "MANUAL";

/** One wall of a room (backend RegionResponse). Codes are always HV codes for customers. */
export interface RoomRegion {
  id: number;
  label: string;
  category: RegionCategory;
  /** Presigned link or the backend's own file route; null when the wall has no mask. */
  maskUrl?: string | null;
  appliedShadeCode?: string | null;
  appliedHvCode?: string | null;
  appliedHexCode?: string | null;
  displayOrder?: number | null;
  /** Drawn by hand (C10) rather than found. */
  manual: boolean;
  /** In the paint plan (C9). Absent means in. */
  inPlan?: boolean;
}

/** GET /api/projects/{id} and /status (backend ProjectResponse, owner view). */
export interface RoomDetail {
  id: string;
  name: string;
  roomType?: string | null;
  status: ProjectStatus;
  imageId: string;
  imageUrl: string;
  imageType?: string | null;
  /** The paint canvas when present — the masks are aligned to it, not the original. */
  cleanedImageUrl?: string | null;
  failureReason?: string | null;
  /** "CLEAN" or "MASK": which half of the run failed. */
  failureStage?: string | null;
  maskMode?: "AUTO" | "MANUAL" | null;
  /** Wall finding ran and found nothing usable; the room is workable, walls by hand. */
  autoMaskFailed?: boolean;
  autoMaskNotice?: string | null;
  aiProgressNote?: string | null;
  /** The walls' colour today, as the photo shows it — context only, never a paint. */
  detectedWallHex?: string | null;
  detectedWallColour?: string | null;
  cleanFurnishing?: "KEEP" | "EMPTY" | null;
  cleanAngle?: "AS_SHOT" | "BEST_VIEW" | null;
  regions: RoomRegion[];
  hasShareLink?: boolean;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  boardsUsed?: number;
  boardsAllowed?: number;
  fromLibrary?: boolean;
  readOnly?: boolean;
  readOnlyReason?: string | null;
  accessExpiresAt?: string | null;
}

/** POST /api/projects/{id}/segment. */
export interface SegmentChoices {
  maskMode: "AUTO" | "MANUAL";
  cleanFurnishing: "KEEP" | "EMPTY";
  cleanAngle: "AS_SHOT" | "BEST_VIEW";
}

/** PUT /api/projects/{id}/regions (one row). Null clears the colour. */
export interface RegionColourUpdate {
  regionId: number;
  shadeCode: string | null;
  hexCode: string | null;
}

/** PUT /api/projects/{id}/regions/plan (one row). Null leaves a field as it was. */
export interface RegionPlanUpdate {
  regionId: number;
  category?: RegionCategory | null;
  label?: string | null;
  inPlan?: boolean | null;
}

/** POST /api/images/upload. */
export interface UploadedImage {
  imageId: string;
  imageUrl: string;
  imageType?: "INTERIOR" | "EXTERIOR" | string | null;
  fileSize?: number;
}

/** A catalogue shade a suggestion matched (backend MatchedShade). */
export interface MatchedShade {
  id?: number;
  shadeCode: string;
  hvCode?: string | null;
  name?: string | null;
  hexCode: string;
  brand?: string | null;
  shadeFamily?: string | null;
}

/** One suggested palette (backend ColorCombo): main, accent and trim. */
export interface ColourCombo {
  name: string;
  rationale?: string | null;
  primaryHex: string;
  primaryShade?: MatchedShade | null;
  accentHex: string;
  accentShade?: MatchedShade | null;
  trimHex: string;
  trimShade?: MatchedShade | null;
}

/** POST /api/projects/{id}/recommendations. */
export interface Recommendations {
  projectId: string;
  imageType?: string | null;
  combinations: ColourCombo[];
}

/** GET /api/me/retailer-combos (one row): a combination the customer's shop put together. */
export interface ShopCombo {
  id: string;
  name: string;
  scope?: "INTERIOR" | "EXTERIOR" | "BOTH" | string | null;
  shades: { code: string; name?: string | null; hex: string }[];
}

export type MaskReportIssue = "MASK_NOT_GENERATED_PROPERLY" | "IMAGE_NOT_CLEANED_PROPERLY" | "OTHER";
export type MaskReportStatus = "NEW" | "IN_REVIEW" | "FIXED" | "RESOLVED";

/** GET /api/projects/{id}/mask-reports/latest — the reporter's own view. */
export interface MaskReport {
  id: string;
  issues: MaskReportIssue[];
  note?: string | null;
  status: MaskReportStatus;
  createdAt?: string;
  promisedBy?: string | null;
  deliveredAt?: string | null;
  fixNote?: string | null;
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
