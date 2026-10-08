import { api } from "../instance";

/**
 * Painters and shops near a point (C32). Any signed-in account may search; the point is
 * used for the sum only — the server neither stores nor logs it.
 *
 * Both searches share one allowance (60 an hour per account, 120 per network), and a
 * painter's number another (20 a day per account, every reveal counted, the same painter
 * again included). A refusal (429) says "Please wait a while" without a time.
 */

/** GET /api/nearby/painters (NearbyPainterResponse). Nearest first, at most 50. */
export interface NearbyPainter {
  /** The painter's account id — what the number is asked for by. */
  id: string;
  /** Null when the account has no name of its own yet. */
  name: string | null;
  about: string | null;
  serviceAreas: string[];
  specialties: string[];
  yearsExperience: number | null;
  /** Rupees. */
  dayRateInr: number | null;
  /** The average of published reviews, one decimal; null when there are none (never 0). */
  rating: number | null;
  ratingCount: number;
  jobsCompleted: number;
  /** To the painter's position as stored — rounded to about a kilometre. */
  distanceKm: number;
}

/** GET /api/nearby/shops (NearbyShopResponse). Nearest first, at most 50. */
export interface NearbyShop {
  id: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  /** The counter's number, as the shop typed it — not checked, not the owner's mobile. */
  phone: string | null;
  /** Free text, e.g. "9 am – 9 pm, closed Tuesday". */
  openingHours: string | null;
  /** The shop's own pin, given for directions. */
  latitude: number;
  longitude: number;
  distanceKm: number;
}

/** GET /api/nearby/painters/{id}/phone — the painter's confirmed mobile, E.164. */
export interface PainterContact {
  id: string;
  phone: string;
}

export interface NearbySearch {
  lat: number;
  lon: number;
  radiusKm: number;
}

export const nearbyApi = {
  /** 400 for a point that can't be right (or 0,0) and a radius outside 1–50 km. */
  painters: ({ lat, lon, radiusKm }: NearbySearch) =>
    api.request<NearbyPainter[]>("api/nearby/painters", { query: { lat, lon, radiusKm } }),

  shops: ({ lat, lon, radiusKm }: NearbySearch) =>
    api.request<NearbyShop[]>("api/nearby/shops", { query: { lat, lon, radiusKm } }),

  /**
   * One painter's number, only when the customer asks for it, so the list can't be walked
   * for numbers. 404 "This painter isn't taking customers through HueVistaa just now." when
   * they've unlisted or their mobile is no longer confirmed.
   */
  painterPhone: (id: string) => api.request<PainterContact>(`api/nearby/painters/${encodeURIComponent(id)}/phone`),
};
