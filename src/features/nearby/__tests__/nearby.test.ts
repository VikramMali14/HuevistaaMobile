/** Ported with nearby.ts from HueVistaFrontEnd/src/lib/__tests__/nearby.test.ts, plus the app's own rules. */
import { dialable, directionsHref, distanceLabel, isRadius, painterFacts, searchPoint, shopHours, shopPlace, telHref, trackRecord, whatsappHref, widerRadius } from "../nearby";

describe("distanceLabel", () => {
  it("speaks in metres under a kilometre, never below 100 m", () => {
    expect(distanceLabel(0.4)).toBe("400 m away");
    expect(distanceLabel(0)).toBe("100 m away");
  });

  it("keeps one decimal under 10 km and drops it beyond", () => {
    expect(distanceLabel(2.4)).toBe("2.4 km away");
    expect(distanceLabel(1)).toBe("1.0 km away");
    expect(distanceLabel(18.3)).toBe("18 km away");
  });

  // A painter's position is kept to about a kilometre: no metres it doesn't have.
  it("says only 'under 1 km' for a painter", () => {
    expect(distanceLabel(0.4, true)).toBe("Under 1 km away");
    expect(distanceLabel(0, true)).toBe("Under 1 km away");
    expect(distanceLabel(3.2, true)).toBe("3.2 km away");
  });

  it("says nothing for a value that is not a distance", () => {
    expect(distanceLabel(Number.NaN)).toBe("");
    expect(distanceLabel(-1)).toBe("");
  });
});

describe("telHref", () => {
  it("strips the spacing people type", () => {
    expect(telHref("+91 98450-12345")).toBe("tel:+919845012345");
    expect(telHref("0831 240 1234")).toBe("tel:08312401234");
  });

  it("offers no link for something that cannot be dialled", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref("call me")).toBeNull();
    expect(dialable("123456")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("takes a bare ten-digit mobile as Indian", () => {
    expect(whatsappHref("98450 12345")).toBe("https://wa.me/919845012345");
  });

  it("drops a trunk zero, and keeps a number already in full", () => {
    expect(whatsappHref("098450 12345")).toBe("https://wa.me/919845012345");
    expect(whatsappHref("+91 98450 12345")).toBe("https://wa.me/919845012345");
    expect(whatsappHref("919845012345")).toBe("https://wa.me/919845012345");
  });

  it("does not guess at a number it cannot place", () => {
    expect(whatsappHref("2401234")).toBeNull();
    expect(whatsappHref(undefined)).toBeNull();
  });
});

describe("directionsHref", () => {
  it("points Google Maps at the shop, and Apple Maps on an iPhone", () => {
    expect(directionsHref(15.852, 74.5, "android")).toBe("https://www.google.com/maps/dir/?api=1&destination=15.852,74.5");
    expect(directionsHref(15.852, 74.5, "ios")).toBe("https://maps.apple.com/?daddr=15.852,74.5");
  });
});

describe("shopPlace and shopHours", () => {
  it("joins the parts the shop gave", () => {
    expect(shopPlace({ addressLine: " Shop 4, Khade Bazar ", city: "Belagavi", state: "Karnataka" })).toBe("Shop 4, Khade Bazar · Belagavi, Karnataka");
    expect(shopPlace({ addressLine: null, city: "Belagavi", state: null })).toBe("Belagavi");
    expect(shopPlace({ addressLine: null, city: null, state: null })).toBe("");
  });

  it("says 'Open' once, even when the shop wrote it", () => {
    expect(shopHours("9 am – 9 pm")).toBe("Open 9 am – 9 pm");
    expect(shopHours("Open 9–9, closed Tuesday")).toBe("Open 9–9, closed Tuesday");
    expect(shopHours("  ")).toBeNull();
  });
});

describe("radii", () => {
  it("offers 2 to 50 km, and searches further one step at a time", () => {
    expect(isRadius(2)).toBe(true);
    expect(isRadius(7)).toBe(false);
    expect(widerRadius(10)).toBe(25);
    expect(widerRadius(50)).toBeNull();
  });
});

describe("searchPoint", () => {
  // Kilometres of search need no more than ~100 m of where the customer stands.
  it("sends the fix to three places", () => {
    expect(searchPoint(15.852347, 74.504981)).toEqual({ lat: 15.852, lon: 74.505 });
  });

  it("refuses a fix the server would refuse", () => {
    expect(searchPoint(0, 0)).toBeNull();
    expect(searchPoint(91, 10)).toBeNull();
    expect(searchPoint(Number.NaN, 10)).toBeNull();
  });
});

describe("a painter's row", () => {
  it("says what they've done, or that they're new", () => {
    expect(trackRecord({ jobsCompleted: 3, rating: 4.56, ratingCount: 23 })).toBe("3 jobs done on HueVistaa · ★ 4.6 from 23 reviews");
    expect(trackRecord({ jobsCompleted: 1, rating: 5, ratingCount: 1 })).toBe("1 job done on HueVistaa · ★ 5.0 from 1 review");
    expect(trackRecord({ jobsCompleted: 0, rating: null, ratingCount: 0 })).toBe("New on HueVistaa — no jobs or reviews yet");
  });

  it("gives years and day rate when they're set", () => {
    expect(painterFacts({ yearsExperience: 12, dayRateInr: 1500 })).toBe("12 yrs experience · ₹1,500/day");
    expect(painterFacts({ yearsExperience: null, dayRateInr: null })).toBe("");
  });
});
