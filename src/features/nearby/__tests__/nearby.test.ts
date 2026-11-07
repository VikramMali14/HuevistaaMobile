/** Ported with nearby.ts from HueVistaFrontEnd/src/lib/__tests__/nearby.test.ts, plus the app's own rules. */
import type { WorkAreas } from "@/api/endpoints/nearby";
import { setLanguage } from "@/i18n";

import { dialable, directionsHref, distanceLabel, placeLabel, shopAddress, shopHours, shopPlace, telHref, whatsappHref } from "../nearby";
import { divisionTowns, isOpen, normalise, openStates, sameAreas, serviceAreasText, toggleDivision, toggleState, workAreasText } from "../work-areas";

describe("distanceLabel", () => {
  it("speaks in metres under a kilometre, never below 100 m", () => {
    expect(distanceLabel(0.4)).toBe("400 m away");
    expect(distanceLabel(0)).toBe("100 m away");
  });

  it("keeps one decimal under 10 km and drops it beyond", () => {
    expect(distanceLabel(2.4)).toBe("2.4 km away");
    expect(distanceLabel(1)).toBe("1.0 km away");
    expect(distanceLabel(18.3)).toBe("18 km away");
    expect(distanceLabel(1237.1)).toBe("1,237 km away");
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

/** Under the district and state from a shop's pin: its street, and a town the district doesn't name. */
describe("shopAddress", () => {
  it("doesn't say the district twice, and keeps a town it doesn't name", () => {
    expect(shopAddress({ addressLine: "Shop 4, Khade Bazar", city: "Belagavi", state: "Karnataka", place: "Belagavi, Karnataka" })).toBe("Shop 4, Khade Bazar");
    expect(shopAddress({ addressLine: "Station Road", city: "Gokak", state: "Karnataka", place: "Belagavi, Karnataka" })).toBe("Station Road · Gokak");
    expect(shopAddress({ addressLine: null, city: "Gokak", state: null, place: "Belagavi, Karnataka" })).toBe("Gokak");
  });

  it("is everything the shop typed when there is no place to read first", () => {
    expect(shopAddress({ addressLine: "Shop 4, Khade Bazar", city: "Belagavi", state: "Karnataka", place: null })).toBe("Shop 4, Khade Bazar · Belagavi, Karnataka");
    expect(shopAddress({ addressLine: "Shop 4", city: "Belagavi", state: "Karnataka" })).toBe("Shop 4 · Belagavi, Karnataka");
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

  // The server's own rules (ActiveStates#normalise), so the preview reads as the card will.
  it("keeps each place once, in the catalogue's order, a whole state for all its divisions", () => {
    expect(normalise(["MP", "RJ-KOTA", "RJ-AJMER", "RJ-KOTA"], catalogue)).toEqual(["RJ-AJMER", "RJ-KOTA", "MP"]);
    expect(normalise(["RJ-AJMER", "RJ-JAIPUR", "RJ-KOTA"], catalogue)).toEqual(["RJ"]);
  });

  /** No longer offered: anywhere in India, kept from before, is every state open now. */
  it("reads anywhere in India, kept from before, as every state in the catalogue", () => {
    expect(normalise(["RJ-KOTA", "IN"], catalogue)).toEqual(["RJ", "GJ", "MP"]);
    expect(normalise(["IN"], { ...catalogue, states: [rajasthan] })).toEqual(["RJ"]);
  });

  /** A place in a state HueVistaa isn't open in: the server drops it on save, so it isn't shown or sent. */
  it("drops a place outside the catalogue", () => {
    expect(normalise(["MH-PUNE", "RJ-KOTA", "KA"], catalogue)).toEqual(["RJ-KOTA"]);
    expect(sameAreas(["MH-PUNE"], [], catalogue)).toBe(true);
  });

  /** The states HueVistaa is open in, said in a sentence in the app's language, and whether a pin's state is one. */
  it("names the open states for a sentence, and knows them", () => {
    expect(openStates({ ...catalogue, states: [rajasthan] })).toBe("Rajasthan");
    expect(openStates({ ...catalogue, states: [gujarat, rajasthan] })).toBe("Gujarat and Rajasthan");
    expect(openStates(catalogue)).toBe("Rajasthan, Gujarat and Madhya Pradesh");
    const india = Array.from({ length: 36 }, (_, i) => ({ ...gujarat, code: `S${i}`, name: `State ${i}` }));
    expect(openStates({ ...catalogue, states: india })).toBeNull();
    setLanguage("hi");
    expect(openStates({ ...catalogue, states: [gujarat, rajasthan] })).toBe("गुजरात और राजस्थान");
    expect(isOpen("RJ", catalogue)).toBe(true);
    expect(isOpen("KA", catalogue)).toBe(false);
    expect(isOpen(null, catalogue)).toBe(false);
  });

  it("says a division's towns in the app's language", () => {
    const ajmer = { hint: "Bhilwara, Nagaur", hintHi: "भीलवाड़ा, नागौर" };
    expect(divisionTowns(ajmer)).toBe("Bhilwara, Nagaur");
    expect(divisionTowns({ hint: null, hintHi: null })).toBeNull();
    setLanguage("hi");
    expect(divisionTowns(ajmer)).toBe("भीलवाड़ा, नागौर");
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

  /** A shop's places, chosen on the website, read the same way on its card. */
  it("says where a shop serves, in the app's language", () => {
    expect(serviceAreasText(["RJ-AJMER", "RJ-KOTA", "GJ", "MP"], catalogue)).toBe("Serves Ajmer, Kota (Rajasthan) · Gujarat · Madhya Pradesh");
    expect(serviceAreasText(["IN"], catalogue)).toBe("Serves anywhere in India");
    expect(serviceAreasText([], catalogue)).toBeNull();
    expect(serviceAreasText(undefined, catalogue)).toBeNull();
    expect(serviceAreasText(["RJ"], null)).toBeNull();
    setLanguage("hi");
    expect(serviceAreasText(["RJ-AJMER", "MP"], catalogue)).toBe("अजमेर (राजस्थान) · मध्य प्रदेश में सेवा देते हैं");
    expect(serviceAreasText(["IN"], catalogue)).toBe("पूरे भारत में कहीं भी सेवा देते हैं");
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
