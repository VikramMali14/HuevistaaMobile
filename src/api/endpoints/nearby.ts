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
 * GET /api/nearby/painters (NearbyPainterResponse). Those based in the place first, at most 200. A painter's card:
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
  /** Not shown: the card says `place`. Null for a search by state or division, which is from no point. */
  distanceKm: number | null;
  /** The PIN code the painter works in; null for a pin from before PIN codes. Absent from older servers. */
  pincode?: string | null;
  /** The town that PIN code is in: "Abu Road". */
  city?: string | null;
  /**
   * Where the painter is based: the town of their PIN code, its district and state ("Abu Road,
   * Sirohi, Rajasthan") — or, for a pin from before PIN codes, "Jaipur, Rajasthan", or the state
   * alone. Shown instead of a distance. Null when the server can't tell; absent from older servers.
   */
  place?: string | null;
  /**
   * Where the painter can go for a job, as WorkAreas codes — divisions ("RJ-AJMER") or whole states
   * ("RJ") HueVistaa is open in — named by `nearbyApi.workAreas`. Empty when the painter hasn't
   * said; absent from older servers.
   */
  workAreas?: string[];
  /**
   * The painter said they work in the place searched — the division, or the whole state — and is
   * found however far off they live. Absent from older servers.
   */
  worksInYourArea?: boolean;
}

/**
 * GET /api/nearby/shops (NearbyShopResponse). The shops based in the place chosen, then those
 * further off that serve it (`servesYourArea`).
 */
export interface NearbyShop {
  id: string;
  name: string;
  addressLine: string | null;
  /** As the shop typed them. The card reads `place` first. */
  city: string | null;
  state: string | null;
  /** The counter's number, as the shop typed it — not checked, not the owner's mobile. */
  phone: string | null;
  /** Free text, e.g. "9 am – 9 pm, closed Tuesday". */
  openingHours: string | null;
  /** The shop's own pin, given for directions. */
  latitude: number;
  longitude: number;
  /** Null for a search by state or division, which is from no point. */
  distanceKm: number | null;
  /** The PIN code the shop said it is in; null for a pin from before PIN codes. Absent from older servers. */
  pincode?: string | null;
  /** The town that PIN code is in: "Abu Road". (`city` is what the owner typed.) */
  pincodeCity?: string | null;
  /**
   * Where the shop is — the town of its PIN code, its district and state — or, to the district, from its pin: "Belagavi, Karnataka", "South Delhi" — or the
   * state alone. Null when the server can't tell; absent from older servers.
   */
  place?: string | null;
  /**
   * Where the shop serves, as WorkAreas codes — divisions ("RJ-AJMER") or whole states ("RJ")
   * HueVistaa is open in — named by `nearbyApi.workAreas`. Empty when the shop hasn't said; absent
   * from older servers.
   */
  serviceAreas?: string[];
  /**
   * The shop said it serves the place searched — the division, or the whole state — and is found
   * however far off it is. Absent from older servers.
   */
  servesYourArea?: boolean;
}

/** GET /api/nearby/painters/{id}/phone — the painter's confirmed mobile, E.164. */
export interface PainterContact {
  id: string;
  phone: string;
}

/**
 * GET /api/nearby/places (PlaceResponse) — a PIN code a customer searches near (C32, C36), or the
 * town, area or PIN a painter finds their pin by (P5): in the states HueVistaa is open in, as a
 * point. Public geography, never an address.
 */
export interface NearbyPlace {
  /** "Ajmer", "Kaiser Ganj" — for a PIN search, the PIN itself. */
  name: string;
  /** "Ajmer, Rajasthan", or just a state for a town. */
  region: string;
  /** Its own PIN when it has one: a PIN, or a post office's locality. Null for a town. */
  pincode: string | null;
  /** For a PIN code, the town it is in — "Abu Road" for 307026 — or its district. Absent for a place found by name. */
  city?: string | null;
  latitude: number;
  longitude: number;
  /** Its state as a work-areas code, "RJ"; null when not known. Absent from older servers. */
  state?: string | null;
  /** Its division, "RJ-AJMER" — known for a PIN or a locality, not a town. Absent from older servers. */
  division?: string | null;
}

/**
 * GET /api/nearby/where (AreaResponse) — which place a point is in: its name as a person says it,
 * and its state and division as WorkAreas codes. Each null when the server can't tell.
 */
export interface NearbyArea {
  /** "Kaiser Ganj Ajmer, Ajmer, Rajasthan" */
  name: string | null;
  /** Its district and state, as a painter's card shows them: "Ajmer, Rajasthan". Absent from older servers. */
  place?: string | null;
  /** "RJ" */
  state: string | null;
  /** "RJ-AJMER" */
  division: string | null;
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
  /** Empty for a place chosen only whole (Chandigarh). */
  divisions: WorkAreaDivision[];
}

/**
 * GET /api/nearby/work-areas (WorkAreasResponse) — the states HueVistaa is open in (Rajasthan at
 * launch), A to Z, each with its divisions: what a customer's search chooses from (the state, then a
 * division), the places a painter says they work in and a shop (on the website) that it serves, and
 * what their cards' codes are read by. Each named in English and Hindi. Public, and the same for
 * everybody.
 */
export interface WorkAreas {
  /**
   * "IN", anywhere in India: no longer offered, and never on a card the server sends any more.
   * Kept from before, it means every state above (features/nearby/work-areas.ts).
   */
  anywhere: string;
  states: WorkAreaState[];
}

/**
 * Where a search looks: a state HueVistaa is open in (a work-areas code, "RJ") — all of it, or one
 * of its divisions ("RJ-AJMER"), with no distance limit — or, for a PIN code, the point it is at
 * (`lat`, `lon`), nearest first.
 */
export interface NearbySearch {
  /** All of a state ("RJ"): everybody in it. */
  state?: string;
  /** Around a PIN code: everybody whose own PIN code is within 20 km of it, nearest first. */
  pincode?: string;
  /** No longer sent by this app: kept for the server's older searches. */
  division?: string;
  lat?: number;
  lon?: number;
}

export const nearbyApi = {
  /**
   * All of a state, or one of its divisions, with no distance limit: those based there first, in
   * order of district, then those further off who work there. With a PIN's point instead of a
   * division: those based in its district or close to it, nearest first. 400 "Choose a state from
   * the list." for a state HueVistaa isn't open in, and for a division not of the state.
   */
  painters: ({ state, pincode, division, lat, lon }: NearbySearch) =>
    api.request<NearbyPainter[]>("api/nearby/painters", { query: { state, pincode, division, lat, lon } }),

  shops: ({ state, pincode, division, lat, lon }: NearbySearch) =>
    api.request<NearbyShop[]>("api/nearby/shops", { query: { state, pincode, division, lat, lon } }),

  /**
   * One painter's number, only when the customer asks for it, so the list can't be walked
   * for numbers. 404 "This painter isn't taking customers through HueVistaa just now." when
   * they've unlisted or their mobile is no longer confirmed.
   */
  painterPhone: (id: string) => api.request<PainterContact>(`api/nearby/painters/${encodeURIComponent(id)}/phone`),

  /**
   * Up to 6 places the words could mean, the likeliest first — in the states HueVistaa is open in,
   * and nowhere else, each with its state and division; empty when none. For a customer's search by
   * PIN code, and a painter putting their pin on the map. Answered from a file on the server, so
   * what is typed goes nowhere else. 400 with a sentence for an empty search or digits that aren't a
   * PIN. Not counted against the searches' allowance.
   */
  places: (q: string) => api.request<NearbyPlace[]>("api/nearby/places", { query: { q } }),

  /** The states and divisions HueVistaa is open in, named in both languages. Not counted against any allowance. */
  workAreas: () => api.request<WorkAreas>("api/nearby/work-areas"),

  /**
   * Which place a point is in, and its state and division. Nothing is kept; not counted against
   * any allowance. 400 for a point that can't be right.
   */
  where: (lat: number, lon: number) => api.request<NearbyArea>("api/nearby/where", { query: { lat, lon } }),
};
