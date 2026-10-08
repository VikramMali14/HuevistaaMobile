/**
 * Money helpers. Ported from HueVistaFrontEnd/src/lib/money.ts — keep the two in step.
 *
 * Every backend amount is in paise. Prices are never worked out on the phone; they are
 * only formatted here.
 */

/** "₹79" / "₹1,299" / "₹79.50" from paise. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees.toLocaleString("en-IN") : rupees.toFixed(2)}`;
}
