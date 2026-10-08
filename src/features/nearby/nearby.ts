import { Platform } from "react-native";

import type { NearbyPainter, NearbyShop } from "@/api/endpoints/nearby";
import { t } from "@/i18n";

/**
 * Painters and shops near you (C32). Ported from the customer website's lib/nearby.ts and
 * the cards in components/app/nearby-finder.tsx, so a row reads the same in both places.
 */

/** The distances offered. The server takes any whole or part km from 1 to 50. */
export const RADII_KM = [2, 5, 10, 25, 50] as const;
export type RadiusKm = (typeof RADII_KM)[number];
/** As the server and the website default. */
export const DEFAULT_RADIUS_KM: RadiusKm = 10;
/** The server's cap on one answer; a full list may leave some out. */
export const MAX_RESULTS = 50;

export function isRadius(value: unknown): value is RadiusKm {
  return typeof value === "number" && (RADII_KM as readonly number[]).includes(value);
}

/** The next distance out, for "Search further" — null at the widest. */
export function widerRadius(km: RadiusKm): RadiusKm | null {
  return RADII_KM.find((r) => r > km) ?? null;
}

export interface SearchPoint {
  lat: number;
  lon: number;
}

/**
 * Where to search from: the phone's fix to three places (about 100 m) — plenty for a
 * search of kilometres, and no more of where the customer stands than that leaves the
 * phone. Null for a fix that can't be right (the server refuses those, and 0,0 too).
 */
export function searchPoint(latitude: number, longitude: number): SearchPoint | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (Math.abs(latitude) < 1e-7 && Math.abs(longitude) < 1e-7) return null;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { lat: round(latitude), lon: round(longitude) };
}

/**
 * "2.4 km away", "18 km away", "400 m away". A painter's position is kept to about a
 * kilometre, so for a painter anything under one reads "Under 1 km away" — never metres
 * the figure doesn't have. A shop's pin is exact.
 */
export function distanceLabel(km: number, coarse = false): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return coarse ? t("nearby.underOneKm") : t("nearby.metresAway", { m: Math.max(100, Math.round(km * 10) * 100) });
  if (km < 10) return t("nearby.kmAway", { km: km.toFixed(1) });
  return t("nearby.kmAway", { km: String(Math.round(km)) });
}

/** A leading + and the digits, or null when it can't be dialled (fewer than 7 digits). */
export function dialable(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const plus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return plus ? `+${digits}` : digits;
}

export function telHref(phone: string | null | undefined): string | null {
  const d = dialable(phone);
  return d ? `tel:${d}` : null;
}

/**
 * A WhatsApp chat with this number, only when it can be placed: with its country code,
 * ten digits (India), a trunk 0 and ten, or 91 and ten. Anything else gets no link — a
 * chat that opens with a stranger is worse than none.
 */
export function whatsappHref(phone: string | null | undefined): string | null {
  const d = dialable(phone);
  if (!d) return null;
  let digits: string;
  if (d.startsWith("+")) digits = d.slice(1);
  else if (d.length === 10) digits = `91${d}`;
  else if (d.length === 11 && d.startsWith("0")) digits = `91${d.slice(1)}`;
  else if (d.length === 12 && d.startsWith("91")) digits = d;
  else return null;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

/** Directions to a shop: Apple Maps on an iPhone, Google Maps everywhere else. */
export function directionsHref(latitude: number, longitude: number, os: string = Platform.OS): string {
  return os === "ios"
    ? `https://maps.apple.com/?daddr=${latitude},${longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/** "12 MG Road · Belagavi, Karnataka", from whichever parts the shop gave. */
export function shopPlace(shop: Pick<NearbyShop, "addressLine" | "city" | "state">): string {
  const town = [shop.city, shop.state].filter((p) => p && p.trim()).join(", ");
  return [shop.addressLine?.trim(), town].filter(Boolean).join(" · ");
}

/** "Open 9 am – 9 pm" — without saying "Open" twice when the shop already did. */
export function shopHours(hours: string | null | undefined): string | null {
  const text = hours?.trim();
  if (!text) return null;
  return /^open\b/i.test(text) ? text : t("nearby.open", { hours: text });
}

/** What a painter has to show for themselves, or that they're new — never a blank. */
export function trackRecord(p: Pick<NearbyPainter, "jobsCompleted" | "rating" | "ratingCount">): string {
  const jobs = p.jobsCompleted ?? 0;
  const parts = [
    jobs > 0 ? (jobs === 1 ? t("nearby.jobOne") : t("nearby.jobs", { n: jobs })) : null,
    p.rating != null && p.ratingCount > 0
      ? p.ratingCount === 1
        ? t("nearby.ratingOne", { rating: Number(p.rating).toFixed(1) })
        : t("nearby.rating", { rating: Number(p.rating).toFixed(1), n: p.ratingCount })
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t("nearby.newPainter");
}

/** "12 yrs experience · ₹1,500/day", from whichever the painter gave. */
export function painterFacts(p: Pick<NearbyPainter, "yearsExperience" | "dayRateInr">): string {
  return [
    p.yearsExperience ? t("nearby.years", { n: p.yearsExperience }) : null,
    p.dayRateInr ? t("nearby.dayRate", { rupees: Number(p.dayRateInr).toLocaleString("en-IN") }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
