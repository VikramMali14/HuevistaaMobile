/**
 * Ported unchanged from HueVistaFrontEnd/src/lib/cart-pack.ts — keep the two in step: the
 * phone must split a basket exactly as the website does, because the split is the one
 * thing the server takes at its word.
 */
import type { CartCatalogue, CartSplit } from "@/api/types";

/**
 * Working out the cheapest way to sell somebody what they asked for.
 *
 * <b>The problem.</b> The counter sells the same two things four ways — a room, an AI
 * picture, a combo of the two, and a special-offer bundle of three of each — and it used
 * to put all four in front of the customer with a stepper each. That is not a shop, it is
 * a spreadsheet: somebody who wants two rooms and one picture has to price three
 * different baskets in their head, notice that one of them silently forfeits a percentage
 * offer, and then decide. Most people do not do that. They pick the obvious line and pay
 * more than they had to, which is a bad deal dressed up as a choice.
 *
 * <b>The fix.</b> The customer says how many rooms and how many pictures. This works out
 * which mix of singles, combos and bundles delivers at least that for the least money,
 * and the counter rings up that mix. The choice was never interesting — it is arithmetic,
 * and arithmetic is the shop's job.
 *
 * <b>Why it may hand over MORE than was asked for.</b> Three rooms on their own cost more
 * than the bundle that carries three rooms and three pictures. Refusing to notice that,
 * on the grounds that nobody asked for pictures, would charge somebody extra for the
 * privilege of receiving less. So a split has to COVER the order, not match it, and the
 * surplus is named on screen rather than slipped in.
 *
 * <b>Why the percentage offers are priced in here.</b> They come off the single lines and
 * not the packages (see {@code offersApplyToPackages} and the server's CartPurchaseService),
 * so packing a basket can COST money: a basket one rupee over a 10% threshold loses the
 * discount the moment its singles are folded into a combo. A cheapest-split search that
 * looked only at ticket prices would walk into exactly that. Every candidate below is
 * priced the way the server prices it — packages at their ticket, the offer struck on
 * whatever is left as singles — so the winner is the cheapest basket in the only sense
 * that matters, which is what the buyer is actually charged.
 *
 * <b>It mirrors the server, and the server still decides.</b> These figures are a courtesy
 * to the person deciding what to buy; the order is priced again from the same rules when
 * Checkout opens. What this module must get right is the SPLIT — the four quantities sent
 * across the wire — because that is the one thing the server takes at its word.
 */

export type { CartSplit };

/** A priced basket: how it is made up, what it hands over, and what it comes to. */
export interface PackedCart extends CartSplit {
  /** Rooms this split delivers. Never fewer than asked for; sometimes more. */
  roomsGranted: number;
  /** AI picture credits this split delivers. Same rule. */
  picturesGranted: number;
  /** The lines at their advertised prices, before any percentage offer. */
  subtotalPaise: number;
  /** The half of the subtotal a percentage offer is measured against and taken off. */
  discountBasePaise: number;
  /** The offer this basket earned, or null. Reported, never requested — see the cart. */
  offer: CartCatalogue["offers"][number] | null;
  discountPaise: number;
  /** What the buyer pays. */
  totalPaise: number;
}

/** Nothing asked for, nothing owed. */
const EMPTY: PackedCart = {
  projects: 0, credits: 0, combos: 0, bundles: 0,
  roomsGranted: 0, picturesGranted: 0,
  subtotalPaise: 0, discountBasePaise: 0, offer: null, discountPaise: 0, totalPaise: 0,
};

/** How many of a package it could ever be worth buying to cover this order. */
function coverCount(rooms: number, pictures: number, perRooms: number, perPictures: number): number {
  if (perRooms <= 0 && perPictures <= 0) return 0;
  const forRooms = perRooms > 0 ? Math.ceil(rooms / perRooms) : 0;
  const forPictures = perPictures > 0 ? Math.ceil(pictures / perPictures) : 0;
  // Past the point where one package alone covers the whole order, another can only ever
  // be surplus on top of a price that already covers it — and a package costs money.
  return Math.max(forRooms, forPictures);
}

/**
 * Price one candidate split exactly the way {@code CartPurchaseService.quote} does.
 *
 * Kept in one function rather than inlined into the search so there is a single place
 * where this screen's arithmetic can be compared against the server's.
 */
function price(split: CartSplit, cart: CartCatalogue): PackedCart {
  const comboProjects = cart.comboProjects ?? 0;
  const comboCredits = cart.comboCredits ?? 0;
  const bundleProjects = cart.bundleProjects ?? 0;
  const bundleCredits = cart.bundleCredits ?? 0;

  const singles = split.projects * cart.projectPricePaise + split.credits * cart.creditPricePaise;
  const packages = split.combos * cart.comboPricePaise + split.bundles * (cart.bundlePricePaise ?? 0);
  const subtotal = singles + packages;

  // One number for the threshold AND the deduction, so no basket lights up "10% applied"
  // and then has ₹0 taken off it. The server strikes it the same way.
  const discountBase = cart.offersApplyToPackages ? subtotal : singles;
  const offer = (cart.offers ?? [])
    .filter((o) => discountBase >= o.minSubtotalPaise)
    .reduce<CartCatalogue["offers"][number] | null>(
      (best, o) => (best === null || o.percentOff > best.percentOff ? o : best),
      null,
    );
  const discount = offer ? Math.floor((discountBase * offer.percentOff) / 100) : 0;

  return {
    ...split,
    roomsGranted: split.projects + split.combos * comboProjects + split.bundles * bundleProjects,
    picturesGranted: split.credits + split.combos * comboCredits + split.bundles * bundleCredits,
    subtotalPaise: subtotal,
    discountBasePaise: discountBase,
    offer,
    discountPaise: discount,
    totalPaise: subtotal - discount,
  };
}

/** The plain basket: everything bought one at a time, no package anywhere near it. */
export function packSingly(rooms: number, pictures: number, cart: CartCatalogue): PackedCart {
  if (rooms + pictures <= 0) return EMPTY;
  return price({ projects: rooms, credits: pictures, combos: 0, bundles: 0 }, cart);
}

/**
 * The cheapest way to hand over at least this many rooms and pictures.
 *
 * Exhaustive over the packages, which is affordable precisely because the counter is
 * small: a line may not exceed {@code maxQuantity} (20), so there are at most a few dozen
 * candidates and no clever search is worth the risk of being subtly wrong about money.
 *
 * Ties break towards the buyer — same price, more in the bag — and then towards the
 * simplest basket to read on a receipt.
 */
export function packCart(rooms: number, pictures: number, cart: CartCatalogue): PackedCart {
  const wantRooms = Math.max(0, Math.floor(rooms));
  const wantPictures = Math.max(0, Math.floor(pictures));
  if (wantRooms + wantPictures <= 0) return EMPTY;

  const max = cart.maxQuantity ?? 20;
  const comboProjects = cart.comboProjects ?? 0;
  const comboCredits = cart.comboCredits ?? 0;
  const comboSells = cart.comboPricePaise > 0 && comboProjects + comboCredits > 0;

  const bundleProjects = cart.bundleProjects ?? 0;
  const bundleCredits = cart.bundleCredits ?? 0;
  const bundleSells = Boolean(cart.bundleAvailable)
    && (cart.bundlePricePaise ?? 0) > 0
    && bundleProjects + bundleCredits > 0;

  const maxBundles = bundleSells
    ? Math.min(max, coverCount(wantRooms, wantPictures, bundleProjects, bundleCredits))
    : 0;

  let best: PackedCart | null = null;

  for (let bundles = 0; bundles <= maxBundles; bundles++) {
    const afterBundlesRooms = Math.max(0, wantRooms - bundles * bundleProjects);
    const afterBundlesPictures = Math.max(0, wantPictures - bundles * bundleCredits);

    const maxCombos = comboSells
      ? Math.min(max, coverCount(afterBundlesRooms, afterBundlesPictures, comboProjects, comboCredits))
      : 0;

    for (let combos = 0; combos <= maxCombos; combos++) {
      const projects = Math.max(0, afterBundlesRooms - combos * comboProjects);
      const credits = Math.max(0, afterBundlesPictures - combos * comboCredits);
      // Every line travels to the server as its own quantity, and the server refuses one
      // over the cap. A split that cannot be SENT is not a candidate, however cheap.
      if (projects > max || credits > max) continue;

      const candidate = price({ projects, credits, combos, bundles }, cart);
      if (best === null || beats(candidate, best)) best = candidate;
    }
  }

  return best ?? packSingly(wantRooms, wantPictures, cart);
}

/** Cheaper wins; then more in the bag for the same money; then the shorter receipt. */
function beats(candidate: PackedCart, incumbent: PackedCart): boolean {
  if (candidate.totalPaise !== incumbent.totalPaise) {
    return candidate.totalPaise < incumbent.totalPaise;
  }
  const candidateGranted = candidate.roomsGranted + candidate.picturesGranted;
  const incumbentGranted = incumbent.roomsGranted + incumbent.picturesGranted;
  if (candidateGranted !== incumbentGranted) return candidateGranted > incumbentGranted;
  return candidate.combos + candidate.bundles < incumbent.combos + incumbent.bundles;
}
