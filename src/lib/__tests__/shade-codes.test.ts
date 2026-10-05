import { codesAreUniversal, displayCodeOf, type ShadeCodeScheme } from "../shade-codes";

/**
 * Which of the two codes a viewer is shown.
 *
 * This is the rule every swatch in the product reads, so it lives in one place and
 * is tested in one place: shop staff read the manufacturer's number because they
 * have to open the tin, and everyone else reads the HV code because every screen
 * they hold can be photographed, forwarded or carried into a different shop.
 */
describe("displayCodeOf", () => {
  const shade = { code: "L124", hvCode: "HV0348" };

  it("gives shop staff the manufacturer's own code", () => {
    expect(displayCodeOf({ showRealCodes: true }, shade)).toBe("L124");
  });

  it("gives everyone else the HV code", () => {
    expect(displayCodeOf({ showRealCodes: false }, shade)).toBe("HV0348");
    expect(displayCodeOf({}, shade)).toBe("HV0348");
  });

  it("withholds the real code when there is nobody to resolve", () => {
    // A failed fetch, or a signed-out visitor. Absent must read as "not staff".
    expect(displayCodeOf(null, shade)).toBe("HV0348");
    expect(displayCodeOf(undefined, shade)).toBe("HV0348");
  });

  it("falls back to the real code when the shade has no HV code", () => {
    // An older backend, or a row inserted before the migration ran. Better a
    // legible code than a blank swatch.
    expect(displayCodeOf(null, { code: "L124" })).toBe("L124");
    expect(displayCodeOf(null, { code: "L124", hvCode: null })).toBe("L124");
    expect(displayCodeOf(null, { code: "L124", hvCode: "" })).toBe("L124");
  });
});

/**
 * Whether the codes on screen can be redeemed anywhere. Drives one sentence on the
 * share page and one line in the colour-board PDF footer — and getting it wrong
 * sends a customer to a counter that cannot read what they are holding.
 */
describe("codesAreUniversal", () => {
  it("is true for HV codes, which any HueVistaa shop can read", () => {
    expect(codesAreUniversal(null)).toBe(true);
    expect(codesAreUniversal({})).toBe(true);
    expect(codesAreUniversal({ showRealCodes: false } satisfies ShadeCodeScheme)).toBe(true);
  });

  it("is false for shop staff, who are reading manufacturer codes", () => {
    // Not a code that travels at all — it is the paint company's own number.
    expect(codesAreUniversal({ showRealCodes: true })).toBe(false);
  });
});
