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

/** "30 points" / "1 point". Points are whole units, never a rupee amount. */
export function formatPoints(points: number): string {
  return `${points.toLocaleString("en-IN")} point${points === 1 ? "" : "s"}`;
}
