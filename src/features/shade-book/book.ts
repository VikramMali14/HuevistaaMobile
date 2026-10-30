import type { ShadeBook, ShadeBookPage } from "@/api/types";

/**
 * The Shade Book's rules that need no phone: what the reader narrows the book to, how many
 * pages the pass would open, when it ends, and what a saved picture is called. The website
 * keeps the same ones (lib/shade-book.ts), so the two read alike.
 */

/** What the reader narrows the book to. Empty and zero mean "any". */
export interface ShadeBookFilter {
  photoId: string;
  colours: number;
  /** A Vista code, or a word of a colour's name: "HV12", "beige". */
  query: string;
}

export const NO_FILTER: ShadeBookFilter = { photoId: "", colours: 0, query: "" };

/** The pages the filter lets through, in the book's order. */
export function filterShadeBook(pages: readonly ShadeBookPage[], filter: ShadeBookFilter): ShadeBookPage[] {
  const words = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return pages.filter((page) => {
    if (filter.photoId && page.photoId !== filter.photoId) return false;
    if (filter.colours && page.colours !== filter.colours) return false;
    if (words.length === 0) return true;
    const text = [page.title, ...page.shades.map((part) => part.shade?.hvCode ?? "")].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** How many colours the book's pages come in, fewest first: [2, 3]. */
export function colourCounts(pages: readonly ShadeBookPage[]): number[] {
  return [...new Set(pages.map((p) => p.colours))].sort((a, b) => a - b);
}

/** Pages the book holds that this reader isn't sent — what the pass would open. */
export function lockedPages(book: Pick<ShadeBook, "total" | "combinations" | "access">): number {
  return book.access.open ? 0 : Math.max(0, book.total - book.combinations.length);
}

/**
 * The server's times are India's wall clock with no zone on them (it runs on IST): read as
 * such whatever zone the phone is set to.
 */
export function istInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const zoned = /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}+05:30`;
  const date = new Date(zoned);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "31 Oct, 4:05 pm" — when the pass ends, in India's time. Null for a time that can't be read. */
export function passEnds(iso: string | null | undefined): string | null {
  const date = istInstant(iso);
  if (!date) return null;
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** How long until the pass ends, in ms (0 once it has); null when no end is known. */
export function msUntilEnd(iso: string | null | undefined, now: number = Date.now()): number | null {
  const date = istInstant(iso);
  return date ? Math.max(0, date.getTime() - now) : null;
}

/**
 * A saved picture's name, carrying the page's Vista codes so a folder of them can be told
 * apart: "huevistaa-shade-book-HV1234-HV0456.jpg" — the server's own rule.
 */
export function pictureFileName(page: Pick<ShadeBookPage, "shades">): string {
  const codes = page.shades.map((part) => part.shade?.hvCode ?? "").filter((code) => /^[A-Za-z0-9]+$/.test(code));
  return `huevistaa-shade-book${codes.length ? `-${codes.join("-")}` : ""}.jpg`;
}
