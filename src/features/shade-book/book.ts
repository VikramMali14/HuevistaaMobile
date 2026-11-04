import type { ShadeBook, ShadeBookFacet, ShadeBookPage, ShadeBookPart, ShadeBookPhoto } from "@/api/types";
import { hexToRgb, luminance } from "@/lib/color";

/**
 * The Shade Book's rules that need no phone. The reader narrows the book — exterior or interior,
 * two colours or three, the colour families a combination must have — and sees every combination
 * that fits painted on a house, in a grid: each on its own, or all on the one house chosen (the
 * colour test's four photos and the houses and rooms the team adds). One opens large, on every
 * house with as many parts. The website keeps the same rules (lib/shade-book.ts), so the two
 * read alike.
 */

/** Every photo the book paints on; an older server sends the colour test's four alone, as `photos`. */
export function bookHouses(book: Pick<ShadeBook, "photos" | "houses">): ShadeBookPhoto[] {
  return book.houses ?? book.photos;
}

/**
 * The colour families the book is browsed by, in the server's order (ColourWords.FAMILIES). A
 * page's `families` are these ids; the swatch is the chip's dot, and the name comes from i18n.
 */
export const SHADE_FAMILIES = [
  { id: "white", swatch: "#F4F1EA" },
  { id: "beige", swatch: "#DCC7A6" },
  { id: "grey", swatch: "#8D9093" },
  { id: "brown", swatch: "#7B5237" },
  { id: "red", swatch: "#B33B3E" },
  { id: "pink", swatch: "#E2A2B6" },
  { id: "orange", swatch: "#D7773A" },
  { id: "yellow", swatch: "#E2B53F" },
  { id: "green", swatch: "#6C9560" },
  { id: "blue", swatch: "#3F6D9D" },
  { id: "purple", swatch: "#7B5B9B" },
] as const;

export type ShadeFamily = (typeof SHADE_FAMILIES)[number]["id"];

/** Where a combination is for: a house's outside, a room, or either. */
export type ShadeBookKind = "ALL" | "EXTERIOR" | "INTERIOR";

/** What the reader narrowed the book to: where, how many colours (0 for any), the families it must have every one of, the words typed. */
export interface ShadeBookFilter {
  kind: ShadeBookKind;
  colours: 0 | 2 | 3;
  families: string[];
  query: string;
}

export const NO_FILTER: ShadeBookFilter = { kind: "ALL", colours: 0, families: [], query: "" };

/** Whether a page — or a count of pages — is of this kind, this many colours, and every family asked for. */
function fits(item: { scope: string; colours: number; families?: readonly string[] }, filter: Pick<ShadeBookFilter, "kind" | "colours" | "families">): boolean {
  if (filter.kind !== "ALL" && item.scope !== filter.kind) return false;
  if (filter.colours && item.colours !== filter.colours) return false;
  const families = item.families ?? [];
  return filter.families.every((f) => families.includes(f));
}

/** The pages that fit the filter, in the book's order. */
export function filterShadeBook(pages: readonly ShadeBookPage[], filter: ShadeBookFilter): ShadeBookPage[] {
  return searchShadeBook(
    pages.filter((page) => fits(page, filter)),
    filter.query,
  );
}

/** The least a colour may reflect to go on a ceiling the combination wasn't made for (LRV 60): ceilings are light. */
const CEILING_LIGHT = 0.6;

/**
 * Whether a page looks right on a photo with a ceiling: its own photo always does, and so does
 * one it was made with a ceiling for; otherwise the colour that would go up there — the lightest
 * left (partsOn) — must be light enough for a ceiling, or a room's accent wall would end up
 * overhead.
 */
function ceilingSuits(page: Pick<ShadeBookPage, "photoId" | "shades">, house: Pick<ShadeBookPhoto, "id" | "surfaces">): boolean {
  if (page.photoId === house.id) return true;
  const at = house.surfaces.findIndex((s) => s.id === "ceiling");
  if (at < 0 || page.shades.some((p) => p.surfaceId === "ceiling")) return true;
  const hex = partsOn(page, house)?.[at]?.shade?.hexCode;
  return !hex || luminance(hexToRgb(hex)) >= CEILING_LIGHT;
}

/**
 * The houses a page is shown on: every one with as many parts as it has colours — of the kind
 * asked for, when one is, and where its colours sit right (a ceiling gets a light one) — its own
 * photo first, then the others of its kind, then the rest.
 */
export function housesFor(
  page: Pick<ShadeBookPage, "photoId" | "scope" | "colours" | "shades">,
  houses: readonly ShadeBookPhoto[],
  kind: ShadeBookKind = "ALL",
): ShadeBookPhoto[] {
  const fit = houses.filter((h) => h.surfaces.length === page.colours && (kind === "ALL" || h.kind === kind) && ceilingSuits(page, h));
  return [
    ...fit.filter((h) => h.id === page.photoId),
    ...fit.filter((h) => h.id !== page.photoId && h.kind === page.scope),
    ...fit.filter((h) => h.id !== page.photoId && h.kind !== page.scope),
  ];
}

/** The houses that fit the filter's kind and number of colours: the ones the grid may be painted on. */
export function housesWhere(houses: readonly ShadeBookPhoto[], filter: Pick<ShadeBookFilter, "kind" | "colours">): ShadeBookPhoto[] {
  return houses.filter((h) => (filter.kind === "ALL" || h.kind === filter.kind) && (!filter.colours || h.surfaces.length === filter.colours));
}

/**
 * The house a page is shown on while the reader hasn't chosen one: its own photo — or, should
 * that one have gone, the first other it fits.
 */
export function ownHouse(
  page: Pick<ShadeBookPage, "photoId" | "scope" | "colours" | "shades">,
  houses: readonly ShadeBookPhoto[],
): ShadeBookPhoto | undefined {
  return houses.find((h) => h.id === page.photoId) ?? housesFor(page, houses)[0];
}

/**
 * The pages to paint on the one house the reader chose, the same photo for each: every one with
 * as many colours as it has parts, whose colours sit right on it (housesFor's rule: a ceiling
 * gets a light one) — those made on it first, then those made for its kind, then the rest, each
 * in the book's order.
 */
export function pagesOn<P extends Pick<ShadeBookPage, "photoId" | "scope" | "colours" | "shades">>(pages: readonly P[], house: ShadeBookPhoto): P[] {
  const fit = pages.filter((p) => p.colours === house.surfaces.length && ceilingSuits(p, house));
  return [
    ...fit.filter((p) => p.photoId === house.id),
    ...fit.filter((p) => p.photoId !== house.id && p.scope === house.kind),
    ...fit.filter((p) => p.photoId !== house.id && p.scope !== house.kind),
  ];
}

/**
 * The grid: the pages that fit the filter, on the house chosen for it — while the filter keeps
 * that house — or each on its own. The Shade Book's screen and a picture opened from it read it
 * alike, so Previous and Next step through what the reader was looking at.
 */
export function gridPages(
  book: Pick<ShadeBook, "combinations" | "photos" | "houses">,
  filter: ShadeBookFilter,
  on: string | null | undefined,
): { house: ShadeBookPhoto | null; pages: ShadeBookPage[] } {
  const house = (on ? housesWhere(bookHouses(book), filter).find((h) => h.id === on) : undefined) ?? null;
  const list = filterShadeBook(book.combinations, filter);
  return { house, pages: house ? pagesOn(list, house) : list };
}

/** What the grid shows, as a picture's route params: the house it is on, and what differs from the whole book. */
export function gridParams(filter: ShadeBookFilter, on: string | null): Record<string, string> {
  const params: Record<string, string> = {};
  if (on) params.on = on;
  if (filter.kind !== "ALL") params.kind = filter.kind;
  if (filter.colours) params.colours = String(filter.colours);
  if (filter.families.length > 0) params.families = filter.families.join(",");
  if (filter.query.trim()) params.q = filter.query.trim();
  return params;
}

type Param = string | string[] | undefined;

/** The filter a picture's route params carry; anything it can't read is left as the whole book's. */
export function filterFromParams(params: { kind?: Param; colours?: Param; families?: Param; q?: Param }): ShadeBookFilter {
  const one = (value: Param) => (Array.isArray(value) ? value[0] : value) ?? "";
  const kind = one(params.kind);
  const colours = Number(one(params.colours));
  const known = new Set<string>(SHADE_FAMILIES.map((f) => f.id));
  return {
    kind: kind === "EXTERIOR" || kind === "INTERIOR" ? kind : "ALL",
    colours: colours === 2 || colours === 3 ? colours : 0,
    families: one(params.families)
      .split(",")
      .filter((f) => known.has(f)),
    query: one(params.q),
  };
}

/**
 * How many pages of the whole book — open or not — would fit the filter with each family added
 * to those already chosen: the number on each family's chip. From the server's facets, which
 * count every page; from the pages sent when it has none.
 */
export function familyCounts(
  book: Pick<ShadeBook, "facets" | "combinations">,
  filter: Pick<ShadeBookFilter, "kind" | "colours" | "families">,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const items: { scope: string; colours: number; families?: readonly string[]; count: number }[] =
    book.facets ?? book.combinations.map((p) => ({ scope: p.scope, colours: p.colours, families: p.families, count: 1 }));
  for (const family of SHADE_FAMILIES) {
    const wanted = filter.families.includes(family.id) ? filter.families : [...filter.families, family.id];
    counts[family.id] = items.filter((item) => fits(item, { ...filter, families: wanted })).reduce((n, item) => n + item.count, 0);
  }
  return counts;
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

/**
 * How many pages that fit the filter — its kind, colours and families; words typed aside — the
 * book holds that this reader isn't sent. An older server without facets is counted by colours
 * alone, and says nothing (0) of a filter by kind or family.
 */
export function lockedFor(
  book: Pick<ShadeBook, "access" | "total" | "totals" | "facets" | "combinations">,
  filter: Pick<ShadeBookFilter, "kind" | "colours" | "families">,
): number {
  if (book.access.open) return 0;
  const sent = book.combinations.filter((p) => fits(p, filter)).length;
  let total: number;
  if (book.facets) {
    total = book.facets.filter((f: ShadeBookFacet) => fits(f, filter)).reduce((n, f) => n + f.count, 0);
  } else if (filter.kind !== "ALL" || filter.families.length > 0) {
    return 0;
  } else {
    total = filter.colours ? (book.totals?.[String(filter.colours)] ?? 0) : book.total;
  }
  return Math.max(0, total - sent);
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
