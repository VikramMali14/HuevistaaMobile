/**
 * /api/painters/** — the painter's own profile: their trade, their listing for customers
 * nearby, and becoming a painter at all.
 * Backend: painter/controller/PainterController.java, painter/service/PainterService.java.
 * Screens: A10, C33, P1, P4, P5, P9, P12.
 */
import { api } from "../instance";

/**
 * GET/PUT /api/painters/me, PUT …/listing, POST /api/painters/me — the backend's
 * PainterProfileResponse (forSelf). Dates are India time with no zone.
 */
export interface PainterProfile {
  userId: string;
  name?: string | null;
  /**
   * The raw stored address — for a mobile sign-up a made-up `ph-…@customers.huevista.local`.
   * Never shown: /api/auth/profile's email is the one fit to show.
   */
  email?: string | null;
  /** The account's CONFIRMED mobile (E.164), the number customers call and the team rings. */
  phone?: string | null;
  phoneVerified?: boolean;
  /** A number still waiting for its code. */
  pendingPhone?: string | null;
  /** Never null from the server; empty means none. */
  serviceAreas?: string[] | null;
  specialties?: string[] | null;
  yearsExperience?: number | null;
  /** Rupees (not paise), to two places. */
  dayRateInr?: number | null;
  /** Average of published reviews, to one place; null with none. */
  rating?: number | null;
  ratingCount?: number;
  jobsCompleted?: number | null;
  active?: boolean;
  createdAt?: string;
  listedForCustomers?: boolean;
  about?: string | null;
  /** Already rounded by the server to two places (about a kilometre). */
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: string | null;
}

/**
 * PUT /api/painters/me. A number key left out is left alone, and null clears it; a list
 * left out is left alone, and [] clears it. `phone` is deliberately absent: the server
 * never stores one this way (a mobile changes only through the texted code, S4).
 */
export interface TradeProfileUpdate {
  serviceAreas?: string[];
  specialties?: string[];
  yearsExperience?: number | null;
  dayRateInr?: number | null;
}

/**
 * PUT /api/painters/me/listing. `about` is always overwritten (left out, it is cleared), so
 * it is always sent. The position: both coordinates set it, `clearLocation` removes it,
 * neither leaves it alone.
 */
export interface ListingUpdate {
  listedForCustomers: boolean;
  about: string;
  latitude?: number;
  longitude?: number;
  clearLocation?: boolean;
}

export const painterApi = {
  /**
   * Turn this CUSTOMER account into a PAINTER for good. Idempotent for a painter.
   * Refused (403) for shop / distributor / admin accounts, a shop's customer profile,
   * and a customer who already has rooms or a shop's code — the message says why. No new
   * token comes back (the role is read on every request): the profile is read again.
   */
  becomePainter: () => api.request<PainterProfile>("api/painters/me", { method: "POST" }),

  /** 404 (with the account id in its sentence — never shown) when there's no profile yet. */
  profile: () => api.request<PainterProfile>("api/painters/me"),

  updateProfile: (body: TradeProfileUpdate) =>
    api.request<PainterProfile>("api/painters/me", { method: "PUT", body }),

  /**
   * 400 when listing without a location or a confirmed mobile, or with only one coordinate;
   * the sentence says which. The server rounds the position to two places before storing it.
   */
  updateListing: (body: ListingUpdate) =>
    api.request<PainterProfile>("api/painters/me/listing", { method: "PUT", body }),
};
