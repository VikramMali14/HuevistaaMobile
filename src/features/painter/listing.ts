import type { ListingUpdate, PainterProfile, TradeProfileUpdate } from "@/api/endpoints/painter";

/**
 * P5 and P12's rules, with the backend's own (PainterService) and the painter website's
 * (listing-screen.tsx, profile-screen.tsx).
 */

/**
 * Where the painter works while being edited: as saved, a new PIN code the server found — with
 * the `place` it turned out to be, "Abu Road, Sirohi, Rajasthan" — or to be removed.
 */
export type PendingLocation = { pincode: string; place: string } | "clear" | null;

export function hasSavedLocation(profile: Pick<PainterProfile, "latitude" | "longitude">): boolean {
  return profile.latitude != null && profile.longitude != null;
}

/**
 * The painter's own photo — GET /api/painters/me/photo, which wants the session (RemoteImage
 * adds it) — addressed by its version so a new one is fetched afresh. Null without one.
 */
export function ownPhotoUrl(version: string | null | undefined): string | null {
  return version ? `/api/painters/me/photo?v=${encodeURIComponent(version)}` : null;
}

/** Whether the listing can be turned on: a PIN code (saved or new, or a pin from before) and a confirmed mobile. */
export function listingNeeds(profile: Pick<PainterProfile, "latitude" | "longitude" | "phoneVerified" | "phone">, pending: PendingLocation) {
  const location = pending === "clear" ? false : pending !== null || hasSavedLocation(profile);
  const mobile = Boolean(profile.phoneVerified && profile.phone);
  return { location, mobile, ready: location && mobile };
}

/**
 * The listing as sent. The PIN code is the whole of where: the server makes the middle of it the
 * painter's location. Left out, the location is left alone.
 */
export function listingBody(listed: boolean, pending: PendingLocation): ListingUpdate {
  const body: ListingUpdate = { listedForCustomers: listed };
  if (pending === "clear") body.clearLocation = true;
  else if (pending) body.pincode = pending.pincode;
  return body;
}

/** The backend's limits on a trade profile (UpdatePainterProfileRequest). */
export const AREAS = { maxItems: 20, maxLength: 80 } as const;
export const SPECIALTIES = { maxItems: 12, maxLength: 40 } as const;

/** Spaces tidied, and blank refused: what an added area or specialty is stored as. */
export function tidy(item: string): string {
  return item.replace(/\s+/g, " ").trim();
}

/**
 * Add an item to a list as the backend would keep it: tidied, not blank, not a repeat (in
 * any case), within the length and count. Returns the list unchanged with why, if not.
 */
export function addItem(list: readonly string[], raw: string, limits: { maxItems: number; maxLength: number }): { list: string[]; problem: "tooLong" | "tooMany" | null } {
  const item = tidy(raw);
  if (!item) return { list: [...list], problem: null };
  if (item.length > limits.maxLength) return { list: [...list], problem: "tooLong" };
  if (list.some((x) => x.toLowerCase() === item.toLowerCase())) return { list: [...list], problem: null };
  if (list.length >= limits.maxItems) return { list: [...list], problem: "tooMany" };
  return { list: [...list, item], problem: null };
}

/** "800" → 800, "" → null, anything else (decimals, letters, a minus) → undefined. */
export function wholeNumber(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d{1,7}$/.test(value)) return undefined;
  return Number(value);
}

/**
 * P12's save. Every key is sent, as the website does: an emptied number goes as null (to
 * clear it), an emptied list as []. `phone` never goes — the server doesn't store one this
 * way, and refuses any number not confirmed by text (S4 is where a mobile changes).
 */
export function tradeBody(fields: { areas: string[]; specialties: string[]; years: number | null; dayRate: number | null }): TradeProfileUpdate {
  return {
    serviceAreas: fields.areas.map(tidy).filter(Boolean),
    specialties: fields.specialties.map(tidy).filter(Boolean),
    yearsExperience: fields.years,
    dayRateInr: fields.dayRate,
  };
}

/** "₹800", "₹1,250" — a rupee amount the server keeps in rupees (not paise). */
export function rupees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}
