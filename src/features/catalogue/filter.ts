import { PARENT_FAMILIES, parentFamilyOf, type ParentFamily } from "@/lib/colour-families";
import { parseColourSearch } from "@/lib/colour-search";
import type { PaintShade } from "@/lib/shade-types";

/** Light / Medium / Dark, in LRV terms a painter would recognise (shade-grid.tsx). */
export const TONES = ["Light", "Medium", "Dark"] as const;
export type Tone = (typeof TONES)[number];

export function toneOf(lrv: number): Tone {
  return lrv >= 55 ? "Light" : lrv >= 25 ? "Medium" : "Dark";
}

export interface CatalogueFilter {
  query: string;
  /** A company's name, or null for all of them. */
  brand: string | null;
  family: ParentFamily | null;
  tone: Tone | null;
}

export const NO_FILTER: CatalogueFilter = { query: "", brand: null, family: null, tone: null };

/**
 * Does this shade's TEXT answer the query? Only what is on screen can be searched: the
 * HV code (safe for everyone — it names no company and no colour), the name while names
 * are shown, the manufacturer's code while codes are shown. Ported from
 * HueVistaFrontEnd components/atelier/shade-grid.tsx `matchesText`.
 */
export function matchesText(
  shade: Pick<PaintShade, "name" | "code" | "hex" | "hvCode">,
  query: string,
  { hideCodes = true, hideNames = false }: { hideCodes?: boolean; hideNames?: boolean } = {},
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (shade.hvCode && shade.hvCode.toLowerCase().includes(q)) return true;
  if (!hideNames && shade.name.toLowerCase().includes(q)) return true;
  if (!hideCodes && shade.code.toLowerCase().includes(q)) return true;
  return shade.hex.toLowerCase().includes(q);
}

/**
 * The shades a filter lets through. A query is read as text first and as a colour
 * ("light yellow", "peela") second; for a colour, the closest come first and a typed
 * name or code still leads. Ported from shade-grid.tsx's `shown`.
 */
export function filterShades(
  shades: readonly PaintShade[],
  filter: CatalogueFilter,
  opts: { hideCodes?: boolean; hideNames?: boolean } = {},
): PaintShade[] {
  const q = filter.query.trim().toLowerCase();
  const colour = q ? parseColourSearch(q) : null;
  const hits: { s: PaintShade; rank: number }[] = [];
  for (const s of shades) {
    if (filter.brand && s.brand !== filter.brand) continue;
    if (filter.family && parentFamilyOf(s.family) !== filter.family) continue;
    if (filter.tone && toneOf(s.lrv) !== filter.tone) continue;
    if (!q) {
      hits.push({ s, rank: 0 });
      continue;
    }
    const text = matchesText(s, q, opts);
    const near = colour ? colour.score(s.hex) : null;
    if (!text && near === null) continue;
    hits.push({ s, rank: text ? -1 : near! });
  }
  if (colour?.ranked) hits.sort((a, b) => a.rank - b.rank);
  return hits.map((h) => h.s);
}

/** The parent families this catalogue actually has, in the fixed order. */
export function familiesPresent(shades: readonly PaintShade[]): ParentFamily[] {
  const present = new Set(shades.map((s) => parentFamilyOf(s.family)));
  return PARENT_FAMILIES.filter((f) => present.has(f));
}

export type GridItem =
  | { kind: "header"; key: string; brand: string; count: number }
  | { kind: "row"; key: string; shades: PaintShade[] };

/**
 * The grid as rows of `columns` tiles, with a heading per company when more than one is
 * on screen (docs/04 C3 "grouped by brand"). Rows rather than FlashList columns, so the
 * headings span the width.
 */
export function gridItems(shades: readonly PaintShade[], columns: number): GridItem[] {
  const byBrand = new Map<string, PaintShade[]>();
  for (const s of shades) {
    const list = byBrand.get(s.brand);
    if (list) list.push(s);
    else byBrand.set(s.brand, [s]);
  }
  const headed = byBrand.size > 1;
  const items: GridItem[] = [];
  for (const [brand, list] of byBrand) {
    if (headed) items.push({ kind: "header", key: `h:${brand}`, brand, count: list.length });
    for (let i = 0; i < list.length; i += columns) {
      const row = list.slice(i, i + columns);
      items.push({ kind: "row", key: `r:${brand}:${row[0]!.brandSlug ?? ""}:${row[0]!.code}`, shades: row });
    }
  }
  return items;
}
