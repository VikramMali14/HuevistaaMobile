/**
 * The painter's points: the wallet, the catalogue they buy kit from, what they've redeemed,
 * and claiming a finished board's QR.
 * Backend: reward/controller/PainterRewardController.java (/api/painter/**),
 * reward/controller/ProjectRewardController.java (/api/rewards/{token}).
 * Screens: P1, P2, P4, P6, P9, P10, P11.
 *
 * None of these is throttled, and none has a role guard of its own: the app's painter
 * guard is what keeps a customer out. Dates are India time with no zone.
 */
import { api } from "../instance";

/** One batch of points, with the moment it lapses. */
export interface PointsLot {
  id: string;
  pointsRemaining: number;
  expiresAt: string;
}

/** One movement. `points` is signed; `label` is the server's own words for it. */
export interface PointsActivity {
  id: string;
  points: number;
  /** PROJECT_QR_EARNED · SPENT_ON_PAINTER_REWARD · PAINTER_REWARD_REFUNDED · EXPIRED · … */
  type: string;
  label: string;
  createdAt: string;
}

/** GET /api/painter/points (PainterWalletResponse). */
export interface PainterWallet {
  balance: number;
  lifetimeEarned: number;
  /** A painter account (the role, nothing to do with the balance). */
  canRedeem: boolean;
  /** How long a batch lasts, in days (365). */
  validityDays: number;
  /** A batch this close to lapsing is warned about (10). */
  expiryWarningDays: number;
  nextExpiringPoints?: number | null;
  nextExpiryAt?: string | null;
  pendingRedemptions: number;
  /** Live batches, soonest to lapse first. */
  lots: PointsLot[];
  /** The newest 20 movements only; there is no older history. */
  recentActivity: PointsActivity[];
}

export type RewardCategory = "TOOLS" | "SITE_KIT" | "SAFETY" | "GEAR" | "VOUCHER" | "TRAINING";

/** GET /api/painter/rewards (one item), priced against the caller's balance when read. */
export interface RewardItem {
  code: string;
  title: string;
  description?: string | null;
  category: RewardCategory | (string & {});
  pointsCost: number;
  /** Null for no limit; 0 for an empty shelf. */
  stock?: number | null;
  inStock: boolean;
  /** In stock and the balance covers it (the role isn't considered: see canRedeem). */
  affordable: boolean;
  pointsShort: number;
}

export type RedemptionStatus = "PENDING" | "FULFILLED" | "REJECTED";

/** A redemption (PainterRedemptionResponse): the voucher it minted and how it stands. */
export interface Redemption {
  id: string;
  itemCode: string;
  itemTitle: string;
  category?: RewardCategory | (string & {}) | null;
  pointsSpent: number;
  /** HV-XXXX-XXXX. */
  voucherCode: string;
  status: RedemptionStatus | (string & {});
  requestedAt: string;
  handledAt?: string | null;
  /** Only on REJECTED: the team's own words. The points spent went back, on a fresh batch. */
  rejectionReason?: string | null;
}

/** GET /api/rewards/{token} — what claiming this board would do. Reserves nothing. */
export interface RewardScan {
  token: string;
  projectId: string;
  role?: "PAINTER" | "RETAILER" | null;
  /** What claiming would pay — set even when it can't be claimed. */
  points: number;
  claimable: boolean;
  /** Why not, in the server's words (free text, not a code). Null when claimable. */
  reason?: string | null;
  retailerClaimed: boolean;
  painterClaimed: boolean;
  expiresAt?: string | null;
}

/** POST /api/rewards/{token}/claim. */
export interface RewardClaim {
  projectId: string;
  role: "PAINTER" | "RETAILER";
  pointsAwarded: number;
  /** The balance after the points landed. */
  balance: number;
  claimedAt: string;
}

export const rewardsApi = {
  wallet: () => api.request<PainterWallet>("api/painter/points"),

  catalogue: () => api.request<RewardItem[]>("api/painter/rewards"),

  /** Newest first, no paging. There is no read of one redemption on its own. */
  redemptions: () => api.request<Redemption[]>("api/painter/redemptions"),

  /**
   * Spend points on an item. `requestKey` makes a retry safe: the same key answers the
   * same redemption (201) instead of spending twice — even for a different item, so a key
   * is never reused for another press. 409: no confirmed mobile, withdrawn or out of stock ·
   * 402: not enough points · 403: not a painter · 404: no such item. Nothing spent on any.
   */
  redeem: (itemCode: string, requestKey: string) =>
    api.request<Redemption>("api/painter/rewards/redeem", { body: { itemCode, requestKey }, timeoutMs: 30_000 }),

  /** 404 "That code isn't one of ours." for a token that isn't a board's. */
  scan: (token: string) => api.request<RewardScan>(`api/rewards/${encodeURIComponent(token)}`),

  /**
   * Claim the painter's half. NOT idempotent and keyless: a second ask after an answer was
   * lost gets 409 "A painter already claimed this board…" — the same words as when somebody
   * else did. Every refusal is a 409 with the server's sentence.
   */
  claim: (token: string) =>
    api.request<RewardClaim>(`api/rewards/${encodeURIComponent(token)}/claim`, { method: "POST", timeoutMs: 30_000 }),
};
