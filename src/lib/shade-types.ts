/**
 * The shade shapes the catalogue, the studio and every swatch share. Ported from
 * HueVistaFrontEnd/src/lib/types.ts (PaintShade, ColorFamily) — keep the two in step.
 */

/** Canonical family for a shade that arrived with none, worked out from its colour. */
export type ColorFamily =
  | "Whites"
  | "Neutrals"
  | "Earths"
  | "Reds"
  | "Greens"
  | "Blues"
  | "Yellows"
  | "Greys"
  | "Browns";

/** A paint company's name, as the backend sends it. The list is dynamic. */
export type ShadeBrand = string;

export interface PaintShade {
  /**
   * The code to look a shade up by. For everyone but an administrator the backend puts
   * the platform-wide HV code ("HV0348") here as well — never the manufacturer's own.
   */
  code: string;
  /** The platform-wide customer-facing code, e.g. "HV0348". Null from an older backend. */
  hvCode?: string | null;
  /** The shade's name; administrators only — everyone else gets the code here. */
  name: string;
  hex: string;
  /** The brand's own family name from the shades table, e.g. "Off Whites". */
  family: string;
  lrv: number;
  brand: ShadeBrand;
  /** The company's slug, e.g. "asian-paints" — what GET /api/shades/{brand}/{code} takes. */
  brandSlug?: string;
  /** Recommended finishes as the shades table spells them, e.g. "Matt", "Eggshell". */
  finishes: ReadonlyArray<string>;
}
