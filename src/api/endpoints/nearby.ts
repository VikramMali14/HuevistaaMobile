import { api } from "../instance";

/**
 * Painters and shops near a point (C32). Any signed-in account may search; the point is
 * used for the sum only — the server neither stores nor logs it.
 *
 * Both searches share one allowance (60 an hour per account, 120 per network), and a
 * painter's number another (20 a day per account, every reveal counted, the same painter
 * again included). A refusal (429) says "Please wait a while" without a time.
 */

/**
 * GET /api/nearby/painters (NearbyPainterResponse). Nearest first, at most 50. A painter's card:
 * name, photo and address — and the number when asked — with the badge, the distance and their
 * record. Nothing else a painter fills in is shown to customers.
 */
export interface NearbyPainter {
  /** The painter's account id — what the number is asked for by. */
  id: string;
  /** Null when the account has no name of its own yet. */
  name: string | null;
  /** The photo on their card, a path on the API (`/api/nearby/painters/{id}/photo?v=…`); null until they add one. */
  photoUrl?: string | null;
  /** Where the painter is, in their own words. Null until they give one. */
  address?: string | null;
  /** No longer shown: the server sends these empty, for app versions that still read them. */
  about?: string | null;
  serviceAreas?: string[];
  specialties?: string[];
  yearsExperience?: number | null;
  /** Rupees. */
  dayRateInr?: number | null;
  /** The average of published reviews, one decimal; null when there are none (never 0). */
  rating: number | null;
  ratingCount: number;
  jobsCompleted: number;
  /** HueVistaa Certified — only certified painters are listed, so true on every result. */
  certified?: boolean;
  /** To the painter's position as stored — rounded to about a kilometre. */
  distanceKm: number;
  /**
   * Where the painter can go for a job, as WorkAreas codes — divisions ("RJ-AJMER"), whole
   * states ("GJ"), or "IN" for anywhere in India — named by `nearbyApi.workAreas`. Empty when
   * the painter hasn't said; absent from older servers.
   */
  workAreas?: string[];
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

/**
 * GET /api/nearby/places (PlaceResponse) — a city, area or PIN code typed instead of
 * sharing a location, as the point to search near. Public geography, never an address.
 */
export interface NearbyPlace {
  /** "Pune", "Kothrud" — for a PIN search, the PIN itself. */
  name: string;
  /** "Pune, Maharashtra", or just a state for a city. */
  region: string;
  /** Its own PIN when it has one: a PIN, or a post office's locality. Null for a city. */
  pincode: string | null;
  latitude: number;
  longitude: number;
}

/** A division of a state — or, for a state without divisions, a region or a district. */
export interface WorkAreaDivision {
  /** "RJ-AJMER" */
  code: string;
  name: string;
  nameHi: string;
  /** The big towns in it besides any it is named after ("Bhilwara, Nagaur, Tonk"); null for one town. */
  hint: string | null;
  hintHi: string | null;
}

/** A state or union territory: chosen whole, or a division at a time. */
export interface WorkAreaState {
  /** "RJ" */
  code: string;
  name: string;
  nameHi: string;
  /** Drawn open at the top of P5's picker (Rajasthan, Gujarat); the rest fold under "Other states". */
  featured: boolean;
  /** Empty for a place chosen only whole (Chandigarh). */
  divisions: WorkAreaDivision[];
}

/**
 * GET /api/nearby/work-areas (WorkAreasResponse) — the places a painter can say they work in:
 * Rajasthan by division, Gujarat by region, then every other state A to Z, each split the same
 * way, and the code for anywhere in India. Each named in English and Hindi. Public, and the same
 * for everybody.
 */
export interface WorkAreas {
  /** "IN" */
  anywhere: string;
  states: WorkAreaState[];
}

export interface NearbySearch {
  lat: number;
  lon: number;
  radiusKm: number;
}

export const nearbyApi = {
  /** 400 for a point that can't be right (or 0,0) and a radius outside 1–50 km (left out, 50). */
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

  /**
   * Up to 6 places the words could mean, the likeliest first; empty when none. Answered
   * from a file on the server, so what is typed goes nowhere else. 400 with a sentence for
   * an empty search or digits that aren't a PIN. Not counted against the searches' allowance.
   */
  places: (q: string) => api.request<NearbyPlace[]>("api/nearby/places", { query: { q } }),

  /** The places painters choose from, named in both languages. Not counted against any allowance. */
  workAreas: () => api.request<WorkAreas>("api/nearby/work-areas"),
};
