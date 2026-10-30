/** Ported with nearby.ts from HueVistaFrontEnd/src/lib/__tests__/nearby.test.ts, plus the app's own rules. */
import type { WorkAreas } from "@/api/endpoints/nearby";
import { setLanguage } from "@/i18n";

import { SEARCH_RADIUS_KM, dialable, directionsHref, distanceLabel, placeLabel, searchPoint, shopHours, shopPlace, telHref, trackRecord, whatsappHref } from "../nearby";
import { normalise, sameAreas, toggleDivision, toggleState, workAreasText } from "../work-areas";

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

describe("the search's reach", () => {
  // No distance to pick, as on the website: always the server's widest, nearest first.
  it("is the server's widest, 50 km", () => {
    expect(SEARCH_RADIUS_KM).toBe(50);
  });
});

describe("where a painter can work", () => {
  const division = (code: string, name: string, nameHi: string) => ({ code, name, nameHi, hint: null, hintHi: null });
  const catalogue: WorkAreas = {
    anywhere: "IN",
    states: [
      {
        code: "RJ",
        name: "Rajasthan",
        nameHi: "राजस्थान",
        divisions: [division("RJ-AJMER", "Ajmer", "अजमेर"), division("RJ-JAIPUR", "Jaipur", "जयपुर"), division("RJ-KOTA", "Kota", "कोटा")],
      },
      { code: "GJ", name: "Gujarat", nameHi: "गुजरात", divisions: [division("GJ-KUTCH", "Kutch", "कच्छ")] },
      { code: "MP", name: "Madhya Pradesh", nameHi: "मध्य प्रदेश", divisions: [] },
    ],
  };
  const [rajasthan, gujarat] = catalogue.states as [WorkAreas["states"][0], WorkAreas["states"][0]];

  afterEach(() => setLanguage("en"));

  // The server's own rules (WorkAreas#normalise), so the preview reads as the card will.
  it("keeps each place once, in the catalogue's order, a whole state for all its divisions", () => {
    expect(normalise(["MP", "RJ-KOTA", "RJ-AJMER", "RJ-KOTA"], catalogue)).toEqual(["RJ-AJMER", "RJ-KOTA", "MP"]);
    expect(normalise(["RJ-AJMER", "RJ-JAIPUR", "RJ-KOTA"], catalogue)).toEqual(["RJ"]);
    expect(normalise(["RJ", "IN"], catalogue)).toEqual(["IN"]);
    // A place added on the server since this build is kept, not lost on save.
    expect(normalise(["MP-BHOPAL", "RJ-KOTA"], catalogue)).toEqual(["RJ-KOTA", "MP-BHOPAL"]);
  });

  it("turns divisions and whole states on and off", () => {
    expect(toggleDivision(["RJ"], rajasthan, "RJ-JAIPUR", catalogue)).toEqual(["RJ-AJMER", "RJ-KOTA"]);
    expect(toggleDivision(["RJ-AJMER", "RJ-KOTA"], rajasthan, "RJ-JAIPUR", catalogue)).toEqual(["RJ"]);
    expect(toggleState(["GJ-KUTCH", "MP"], gujarat, catalogue)).toEqual(["GJ", "MP"]);
    expect(toggleState(["GJ", "MP"], gujarat, catalogue)).toEqual(["MP"]);
    expect(sameAreas(["MP", "RJ-AJMER"], ["RJ-AJMER", "MP"], catalogue)).toBe(true);
    expect(sameAreas(["RJ-AJMER"], [], catalogue)).toBe(false);
  });

  it("says them as the card does, in the app's language", () => {
    expect(workAreasText(["RJ-AJMER", "RJ-KOTA", "GJ", "MP"], catalogue)).toBe("Works in Ajmer, Kota (Rajasthan) · Gujarat · Madhya Pradesh");
    expect(workAreasText(["IN"], catalogue)).toBe("Works anywhere in India");
    setLanguage("hi");
    expect(workAreasText(["RJ-AJMER", "MP"], catalogue)).toBe("अजमेर (राजस्थान) · मध्य प्रदेश में काम करते हैं");
  });

  it("says nothing with nothing chosen, or before the names have loaded", () => {
    expect(workAreasText([], catalogue)).toBeNull();
    expect(workAreasText(undefined, catalogue)).toBeNull();
    expect(workAreasText(["RJ-AJMER"], null)).toBeNull();
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
});

describe("placeLabel", () => {
  it("names a city by its state", () => {
    expect(placeLabel({ name: "Pune", region: "Maharashtra", pincode: null })).toBe("Pune, Maharashtra");
  });

  it("gives a locality its district and its PIN", () => {
    expect(placeLabel({ name: "Kothrud", region: "Pune, Maharashtra", pincode: "411038" })).toBe("Kothrud, Pune, Maharashtra · 411038");
  });

  it("says a PIN search is a PIN, and where it is", () => {
    expect(placeLabel({ name: "411038", region: "Pune, Maharashtra", pincode: "411038" })).toBe("PIN 411038 · Pune, Maharashtra");
  });
});
