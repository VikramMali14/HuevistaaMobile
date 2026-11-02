/**
 * Features switched off for now — the phone app's copy of the website's switch
 * (HueVistaFrontEnd src/lib/hidden-features.ts). Keep the two in step.
 *
 * Hidden, not deleted: every screen that offers one of these asks this file first, so
 * bringing a feature back is changing its `false` to `true` here and nothing else.
 *
 * - Gone: every button, row, tile and line that leads to the feature or tells somebody to
 *   use it.
 * - Kept: the screen itself, by its address (a link to /add-shop-code still opens it), and
 *   everything a customer already has from a code — their shop, its rooms, "My products",
 *   and asking that shop for another room.
 */

/**
 * Shop codes — the "redeem codes" a paint shop hands a customer, which the customer types in
 * (C30, "Add a shop code") to get the rooms on it. Off: no customer is told to enter one.
 */
export const SHOW_SHOP_CODES = false;
