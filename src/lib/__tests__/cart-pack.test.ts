/** Ported unchanged from HueVistaFrontEnd/src/lib/__tests__/cart-pack.test.ts. */
import type { CartCatalogue } from "@/api/types";
import { packCart, packSingly } from "@/lib/cart-pack";

/**
 * The counter as the server serves it: ₹149 a room, ₹70 a picture, ₹199 the combo of one
 * of each, and the special offer at ₹438 for what costs ₹657 line by line. The percentage
 * offers reach the single lines only, which is the default and the interesting case.
 */
const CART: CartCatalogue = {
  eligible: true,
  projectPricePaise: 14900,
  creditPricePaise: 7000,
  comboPricePaise: 19900,
  comboProjects: 1,
  comboCredits: 1,
  bundleAvailable: true,
  bundlePricePaise: 43800,
  bundleListPricePaise: 65700,
  bundleProjects: 3,
  bundleCredits: 3,
  validDays: 365,
  maxQuantity: 20,
  offers: [
    { code: "HUE10", minSubtotalPaise: 28900, percentOff: 10 },
    { code: "HUE20", minSubtotalPaise: 58900, percentOff: 20 },
    { code: "HUE25", minSubtotalPaise: 98900, percentOff: 25 },
  ],
  availableProjects: 0,
  creditBalance: 0,
  currency: "INR",
};

/** Every split the packer returns must at least cover the order it was given. */
function expectCovers(packed: ReturnType<typeof packCart>, rooms: number, pictures: number) {
  expect(packed.roomsGranted).toBeGreaterThanOrEqual(rooms);
  expect(packed.picturesGranted).toBeGreaterThanOrEqual(pictures);
}

describe("packCart", () => {
  it("empties to nothing rather than to a zero-rupee order", () => {
    const packed = packCart(0, 0, CART);
    expect(packed.totalPaise).toBe(0);
    expect(packed).toMatchObject({ projects: 0, credits: 0, combos: 0, bundles: 0 });
  });

  it("takes the combo for a room and a picture, which is what the customer used to miss", () => {
    // ₹149 + ₹70 = ₹219 bought as two lines; ₹199 as the combo. The old counter put both
    // in front of the buyer and let them work it out, and most of them did not.
    const packed = packCart(1, 1, CART);

    expect(packed).toMatchObject({ combos: 1, projects: 0, credits: 0, bundles: 0 });
    expect(packed.totalPaise).toBe(19900);
    expect(packSingly(1, 1, CART).totalPaise).toBe(21900);
  });

  it("hands over more than was asked for when that is the cheaper way to sell it", () => {
    // Three rooms on their own are ₹447. The bundle is ₹438 and carries three pictures
    // with it. Refusing to notice, on the grounds that nobody asked for pictures, would
    // charge somebody extra for the privilege of receiving less.
    //
    // On a counter with no percentage offers running, so this says one thing: a package
    // that OVERSHOOTS is still a candidate. What happens when the two mechanisms pull
    // against each other is the next test's business.
    const cart: CartCatalogue = { ...CART, offers: [] };
    const packed = packCart(3, 0, cart);

    expect(packed).toMatchObject({ bundles: 1, combos: 0, projects: 0, credits: 0 });
    expect(packed.totalPaise).toBe(43800);
    expect(packed.roomsGranted).toBe(3);
    expect(packed.picturesGranted).toBe(3);
    expect(packSingly(3, 0, cart).totalPaise).toBe(44700);
  });

  it("declines the same overshoot when the offer it forfeits is worth more", () => {
    // The identical order against the live counter: ₹447 of single lines clears the ₹289
    // threshold, so 10% makes them ₹402.30 — ₹35.70 better than the bundle, and the
    // three pictures are not worth ₹35.70 to somebody who asked for none of them.
    const packed = packCart(3, 0, CART);

    expect(packed).toMatchObject({ projects: 3, bundles: 0, combos: 0, credits: 0 });
    expect(packed.totalPaise).toBe(40230);
  });

  it("leaves a basket alone when packing it would cost the percentage offer", () => {
    // This is the trap. Seven rooms are ₹1,043 of single lines, which earns 25% and pays
    // ₹782.25. Packing two of them into bundles takes ₹1,025 off the ticket and the
    // discount with it — a cheaper-looking basket that charges ₹243 more. A search that
    // looked only at ticket prices would walk straight into it.
    const packed = packCart(7, 0, CART);

    expect(packed).toMatchObject({ projects: 7, credits: 0, combos: 0, bundles: 0 });
    expect(packed.offer?.percentOff).toBe(25);
    expect(packed.totalPaise).toBe(78225);
  });

  it("never charges more than buying the same order one line at a time", () => {
    // The property that matters: the plain basket is always a candidate, so the packer
    // can only ever match it or beat it. Swept across the counter's whole range.
    for (let rooms = 0; rooms <= 12; rooms += 1) {
      for (let pictures = 0; pictures <= 12; pictures += 1) {
        const packed = packCart(rooms, pictures, CART);
        expect(packed.totalPaise).toBeLessThanOrEqual(packSingly(rooms, pictures, CART).totalPaise);
        expectCovers(packed, rooms, pictures);
      }
    }
  });

  it("prices every split the way the server prices it", () => {
    // The offer is struck on the single lines and taken off the single lines — the same
    // one number for the threshold and the deduction, so no basket lights up "10%
    // applied" and then has ₹0 taken off it.
    const packed = packCart(2, 0, CART);

    expect(packed.discountBasePaise).toBe(29800);
    expect(packed.offer?.code).toBe("HUE10");
    // ₹298 less 10% = ₹268.20, floored to the paisa exactly as CartPurchaseService does.
    expect(packed.discountPaise).toBe(2980);
    expect(packed.totalPaise).toBe(26820);
  });

  it("puts the packages back inside the offer when the server says to", () => {
    // Which half the offers reach is a campaign setting, not this module's rule.
    const cart = { ...CART, offersApplyToPackages: true };
    const packed = packCart(2, 2, cart);

    expect(packed.combos).toBe(2);
    expect(packed.discountBasePaise).toBe(39800);
    expect(packed.totalPaise).toBe(35820);
  });

  it("ignores an offer that has been wound down", () => {
    // `bundleAvailable: false` is the switch, and the server refuses a bundle line
    // outright when it is off — a split that cannot be sent is not a candidate.
    const packed = packCart(3, 3, { ...CART, bundleAvailable: false });

    expect(packed.bundles).toBe(0);
    expectCovers(packed, 3, 3);
  });

  it("never sends a line the server would refuse for being over the cap", () => {
    // Every quantity travels as its own number and the server rejects one over
    // maxQuantity. A cheap split that cannot be sent is worth nothing.
    const cart = { ...CART, maxQuantity: 4 };
    for (let rooms = 0; rooms <= 4; rooms += 1) {
      for (let pictures = 0; pictures <= 4; pictures += 1) {
        const packed = packCart(rooms, pictures, cart);
        for (const qty of [packed.projects, packed.credits, packed.combos, packed.bundles]) {
          expect(qty).toBeLessThanOrEqual(4);
          expect(qty).toBeGreaterThanOrEqual(0);
        }
        expectCovers(packed, rooms, pictures);
      }
    }
  });

  it("works a counter with no packages on it at all", () => {
    // An older backend, or a catalogue with the combo priced out. The packer falls back
    // to the plain basket rather than to nothing.
    const cart: CartCatalogue = { ...CART, comboPricePaise: 0, bundleAvailable: false };
    const packed = packCart(2, 3, cart);

    expect(packed).toMatchObject({ projects: 2, credits: 3, combos: 0, bundles: 0 });
    expect(packed.totalPaise).toBe(packSingly(2, 3, cart).totalPaise);
  });

  it("buys the picture on its own rather than a combo it did not ask for", () => {
    // A credit is ₹70 and the combo is ₹199. Covering an order for one picture with a
    // combo would be handing over a room nobody wanted, for ₹129 more.
    const packed = packCart(0, 1, CART);

    expect(packed).toMatchObject({ credits: 1, combos: 0, bundles: 0, projects: 0 });
    expect(packed.totalPaise).toBe(7000);
  });
});
