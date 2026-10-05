// Ported from HueVistaFrontEnd/src/lib/shade-codes.ts — keep the two in step.
/**
 * How a shop presents a colour to whoever is looking at it.
 *
 * Shops used to be able to invent their own numbering — a prefix, a pair spliced
 * into the middle and a suffix, wrapped around the manufacturer's code. That is
 * gone. There are now two codes in the product and one rule for choosing between
 * them: administrators read the paint company's own code, and everyone else — shops
 * included — reads the platform-wide HV code, which names no company and no shade and
 * can be taken to any HueVistaa counter. A shop reads the company's code off an HV code
 * with the Colour decoder.
 *
 * The rule is enforced by the backend now, not here: every response to anyone but an
 * administrator carries the HV code in the code field and no shade names, so the
 * browser never holds a manufacturer's code to leak. This module decides what to PRINT
 * from what arrived.
 *
 * What survives here is that rule and the two disclosure switches that travel with
 * it — whether paint names and paint companies may be printed beside a swatch.
 */

export interface ShadeCodeScheme {
  /**
   * Whether paint NAMES are shown anywhere under this shop. A shop can hide
   * "Asian Paints Ivory Mist" on every screen its customers see. Absent means
   * yes, which is the default everywhere.
   */
  showNames?: boolean;
  /**
   * Whether the paint COMPANY may be printed against an individual shade.
   *
   * False for every customer, guest, painter and share-link viewer, and unlike
   * {@link showNames} that is not a per-shop choice. A shade is identified by its
   * company, its name and its code together, so hiding two of the three while stamping
   * "Asian Paints" on the swatch withholds nothing — one call to that company resolves
   * the colour.
   *
   * This says nothing about the company as a FILTER. Customers still pick which
   * companies they are browsing, because they will be buying from a shop that stocks
   * some and not others, and the picker names them. What goes is the per-shade
   * attribution.
   *
   * Absent means yes — the default for shop staff, and for an older backend that does
   * not send the field, whose viewers are resolved by `showRealCodes` anyway.
   */
  showBrands?: boolean;
  /**
   * Whether this viewer may see the manufacturer's own shade codes.
   *
   * True for administrators only. False for everyone else — shops, customers, guests,
   * painters, share-link viewers — and for them {@link displayCodeOf} returns the
   * platform-wide HV code instead, which names no company and no shade and can only be
   * read back by a HueVistaa shop's decoder.
   *
   * Absent means FALSE, deliberately. An older backend, a failed fetch and a viewer
   * we could not resolve all land here, and the safe answer to "should this person see
   * the real code" is no: withholding costs a shop one lookup, while leaking hands away
   * the only thing the HV code protects.
   */
  showRealCodes?: boolean;
}

/**
 * The code to PRINT for a shade, for whoever is looking at it.
 *
 * The one rule, in one place, because a colour appears on a dozen surfaces — the
 * studio, the catalogue, the finder, a saved board, a forwarded share link — and the
 * HV code is only worth anything if every one of them agrees. A single screen that
 * prints the manufacturer's code undoes it everywhere.
 *
 * 1. ADMINISTRATORS get the manufacturer's own code. They curate the catalogue it
 *    comes from.
 *
 * 2. EVERYONE ELSE gets the HV code — global, opaque, and readable at any HueVistaa
 *    shop rather than only the one that issued the board. For them the backend already
 *    sends the HV code in `code` as well, so the fallback only ever prints an HV code.
 */
export function displayCodeOf(
  scheme: ShadeCodeScheme | null | undefined,
  shade: { code: string; hvCode?: string | null },
): string {
  if (scheme?.showRealCodes) return shade.code;
  return shade.hvCode || shade.code;
}

/**
 * Whether the codes this viewer is being shown can be read at ANY HueVistaa shop.
 *
 * True for HV codes, false for the manufacturer's own numbering. The distinction has
 * to be said out loud wherever a code leaves the screen and goes somewhere we cannot
 * follow it: a printed colour board, a forwarded share link.
 */
export function codesAreUniversal(scheme: ShadeCodeScheme | null | undefined): boolean {
  return !scheme?.showRealCodes;
}
