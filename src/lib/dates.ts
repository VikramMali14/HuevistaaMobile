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
