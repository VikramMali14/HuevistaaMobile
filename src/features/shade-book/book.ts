import type { ShadeBook, ShadeBookPage, ShadeBookPart, ShadeBookPhoto } from "@/api/types";
import { hexToRgb, luminance } from "@/lib/color";

/**
 * The Shade Book's rules that need no phone. The book is read photo first: one of the colour
 * test's four photos — two rooms, two houses, two parts to paint or three — and every
 * combination with as many colours as it has parts, painted on it. The website keeps the same
 * rules (lib/shade-book.ts), so the two read alike.
 */

/**
 * The photo the book opens on: the one its first page was made for, so a combination is
 * painted the moment the screen opens; else the first photo.
 */
export function firstPhoto(book: Pick<ShadeBook, "photos" | "combinations">): ShadeBookPhoto | undefined {
  const made = book.combinations[0]?.photoId;
  return book.photos.find((p) => p.id === made) ?? book.photos[0];
}

/**
 * The combinations that can be painted on a photo — as many colours as it has parts — those
 * made for its kind (a room, a house) first, each in the book's order.
 */
export function combinationsFor(pages: readonly ShadeBookPage[], photo: Pick<ShadeBookPhoto, "kind" | "surfaces">): ShadeBookPage[] {
  const fits = pages.filter((p) => p.colours === photo.surfaces.length);
  return [...fits.filter((p) => p.scope === photo.kind), ...fits.filter((p) => p.scope !== photo.kind)];
}

/** The pages whose title or Vista codes hold every word typed: "HV12", "beige". */
export function searchShadeBook(pages: readonly ShadeBookPage[], query: string): ShadeBookPage[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...pages];
  return pages.filter((page) => {
    const text = [page.title, ...page.shades.map((part) => part.shade?.hvCode ?? "")].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** How many pages with this number of colours the book holds that this reader isn't sent. */
export function lockedFor(book: Pick<ShadeBook, "access" | "totals" | "combinations">, colours: number): number {
  if (book.access.open) return 0;
  const total = book.totals?.[String(colours)] ?? 0;
  return Math.max(0, total - book.combinations.filter((p) => p.colours === colours).length);
}

/**
 * A page's shades on a photo with as many parts — its own, or another — by the server's rule
 * (ShadeBookService.partsOn), so the codes under the picture name the parts it was painted
 * with: parts both photos share keep their colour; a ceiling the page wasn't made for takes the
 * lightest of the rest; the others follow in order, the main colour first. Null for a photo with
 * a different number of parts.
 */
export function partsOn(page: Pick<ShadeBookPage, "photoId" | "shades">, photo: Pick<ShadeBookPhoto, "id" | "surfaces">): ShadeBookPart[] | null {
  const own = page.shades;
  if (page.photoId === photo.id) return own;
  const surfaces = photo.surfaces;
  if (own.length !== surfaces.length || own.some((part) => !part.shade)) return null;
  const placed: (ShadeBookPart["shade"] | null)[] = surfaces.map(() => null);
  const left = own.map((_, i) => i);
  const take = (k: number) => {
    left.splice(left.indexOf(k), 1);
    return own[k]!.shade;
  };
  surfaces.forEach((surface, i) => {
    const k = left.find((j) => own[j]!.surfaceId === surface.id);
    if (k !== undefined) placed[i] = take(k);
  });
  const light = (k: number) => luminance(hexToRgb(own[k]!.shade.hexCode));
  surfaces.forEach((surface, i) => {
    if (placed[i] || surface.id !== "ceiling" || left.length === 0) return;
    placed[i] = take(left.reduce((a, b) => (light(b) > light(a) ? b : a)));
  });
  surfaces.forEach((_, i) => {
    if (!placed[i]) placed[i] = take(left[0]!);
  });
  return surfaces.map((surface, i) => ({ surfaceId: surface.id, surfaceLabel: surface.label, shade: placed[i]! }));
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
