import { Platform } from "react-native";

import type { NearbyPlace, NearbyShop } from "@/api/endpoints/nearby";
import { t } from "@/i18n";

/**
 * Painters and shops near you (C32). Ported from the customer website's lib/nearby.ts and
 * the cards in components/app/nearby-finder.tsx, so a row reads the same in both places.
 */

/**
 * "2.4 km away", "18 km away", "400 m away" — how far a shop is, from its exact pin. A painter's
 * card says the district and state they're based in instead (`place`).
 */
export function distanceLabel(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) return "";
  if (km < 1) return t("nearby.metresAway", { m: Math.max(100, Math.round(km * 10) * 100) });
  if (km < 10) return t("nearby.kmAway", { km: km.toFixed(1) });
  return t("nearby.kmAway", { km: Math.round(km).toLocaleString("en-IN") });
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

/**
 * A town found for a painter's pin, as P5 says it: "Ajmer, Rajasthan", "Kaiser Ganj Ajmer, Ajmer,
 * Rajasthan · 305001", or "PIN 305001 · Ajmer, Rajasthan" — enough to see it is the place meant,
 * and not the other one of that name. As the website's placeLabel.
 */
export function placeLabel(place: Pick<NearbyPlace, "name" | "region" | "pincode">): string {
  const region = place.region?.trim();
  if (place.pincode && place.name === place.pincode) {
    return [t("nearby.pin", { pin: place.pincode }), region].filter(Boolean).join(" · ");
  }
  const named = [place.name, region].filter(Boolean).join(", ");
  return place.pincode ? `${named} · ${place.pincode}` : named;
}

/** "12 MG Road · Belagavi, Karnataka", from whichever parts the shop gave. */
export function shopPlace(shop: Pick<NearbyShop, "addressLine" | "city" | "state">): string {
  const town = [shop.city, shop.state].filter((p) => p && p.trim()).join(", ");
  return [shop.addressLine?.trim(), town].filter(Boolean).join(" · ");
}

/**
 * The street line under a shop's district and state (`place`, from its pin): its address, and the
 * town it typed when neither already says it — "Shop 4, Khade Bazar · Gokak" under "Belagavi,
 * Karnataka", but not "Belagavi" twice. Without a `place` (an older server) it is the whole of
 * what the shop typed, as before. As the website's shopAddress.
 */
export function shopAddress(shop: Pick<NearbyShop, "addressLine" | "city" | "state" | "place">): string {
  const place = shop.place?.trim();
  if (!place) return shopPlace(shop);
  const street = shop.addressLine?.trim() ?? "";
  const city = shop.city?.trim();
  const said = `${street} ${place}`.toLowerCase();
  return [street, city && !said.includes(city.toLowerCase()) ? city : null].filter(Boolean).join(" · ");
}

/** "Open 9 am – 9 pm" — without saying "Open" twice when the shop already did. */
export function shopHours(hours: string | null | undefined): string | null {
  const text = hours?.trim();
  if (!text) return null;
  return /^open\b/i.test(text) ? text : t("nearby.open", { hours: text });
}
