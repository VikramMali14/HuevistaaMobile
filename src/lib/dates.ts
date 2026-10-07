/**
 * Dates as the website prints them: "5 Oct 2026", in India's time zone, whatever
 * zone the phone is set to. Worked out by hand rather than through Intl, so it reads
 * the same on every Android build. Mirrors HueVistaFrontEnd/src/lib/dates.ts.
 */

import { t } from "@/i18n";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** India Standard Time is UTC+5:30 all year — no daylight saving to follow. */
const IST_OFFSET_MS = 330 * 60_000;

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "5 Oct 2026", or "—" for a missing or broken date. */
export function formatDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "—";
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

export function hasPassed(iso: string | null | undefined, now: number = Date.now()): boolean {
  const d = toDate(iso);
  return d !== null && d.getTime() <= now;
}

/**
 * A server time as a moment. The backend writes India time with no zone
 * ("2026-03-14T16:20:00.123456"), which `new Date` would read as the PHONE's local time —
 * hours out on a phone set to any other zone. So a zone-less time is read as India's; one
 * that carries a zone is read as written. NaN for a missing or broken one.
 */
export function serverMoment(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const text = iso.trim();
  const zoned = /([zZ]|[+-]\d\d:?\d\d)$/.test(text);
  // Hermes reads at most milliseconds; the server can send microseconds.
  const trimmed = text.replace(/(\.\d{3})\d+/, "$1");
  return Date.parse(zoned ? trimmed : `${trimmed}+05:30`);
}

/** "14 Mar 2026" from a server time, in India; "—" when there isn't one. */
export function formatServerDate(iso: string | null | undefined): string {
  const at = serverMoment(iso);
  if (!Number.isFinite(at)) return "—";
  const ist = new Date(at + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** "14 Mar, 4:20 pm" from a server time, in India; "—" when there isn't one. */
export function formatServerDateTime(iso: string | null | undefined): string {
  const at = serverMoment(iso);
  if (!Number.isFinite(at)) return "—";
  const ist = new Date(at + IST_OFFSET_MS);
  const hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
  const half = hours < 12 ? "am" : "pm";
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}, ${hours % 12 || 12}:${minutes} ${half}`;
}

/**
 * Whole days from now until a server time, rounded up and never below 0 — "expires in 3
 * days" stays 3 until it is 2. Null when there is no time to count to.
 */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  const at = serverMoment(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 86_400_000));
}

/**
 * Days from today until a server time's date, both in India — 0 for later today, 1 for
 * tomorrow — never below 0. For saying "today" or "tomorrow", which {@link daysUntil}
 * can't: an hour left tonight rounds up to a day.
 */
export function calendarDaysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  const at = serverMoment(iso);
  if (!Number.isFinite(at)) return null;
  const day = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / 86_400_000);
  return Math.max(0, day(at) - day(now));
}

/** The hour of day in India, 0–23 — for "Good morning". */
export function istHour(now: number = Date.now()): number {
  return new Date(now + IST_OFFSET_MS).getUTCHours();
}

/** "30 days", "3 months", "a year" — how long a room stays open. From project-validity.ts. */
export function validitySpan(days: number): string {
  if (days > 0 && days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? t("time.aYear") : t("time.years", { n: years });
  }
  if (days % 30 === 0 && days >= 60) return t("time.months", { n: days / 30 });
  return t("time.days", { n: days });
}
