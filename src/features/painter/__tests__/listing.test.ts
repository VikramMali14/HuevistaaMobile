import { addItem, AREAS, coarsen, listingBody, listingNeeds, rupees, SPECIALTIES, tradeBody, wholeNumber } from "../listing";

const profile = { latitude: 19.07, longitude: 72.88, phoneVerified: true, phone: "+919876543210" };

describe("listing (P5)", () => {
  // The server keeps 2 places (about a kilometre); the phone never sends more than that.
  it("sends a position rounded to two places", () => {
    expect(coarsen(19.076543)).toBe(19.08);
    expect(coarsen(-0.004)).toBe(-0);
    expect(listingBody(true, "  Twenty years in Thane  ", { latitude: 19.076543, longitude: 72.877712, accuracy: 30 })).toEqual({
      listedForCustomers: true,
      about: "Twenty years in Thane",
      latitude: 19.08,
      longitude: 72.88,
    });
  });

  // The server overwrites "about" whenever it is missing, so it always goes.
  it("always sends about, and clears the location only when asked", () => {
    expect(listingBody(false, "", null)).toEqual({ listedForCustomers: false, about: "" });
    expect(listingBody(false, "Hi", "clear")).toEqual({ listedForCustomers: false, about: "Hi", clearLocation: true });
  });

  it("needs a location and a confirmed mobile", () => {
    expect(listingNeeds(profile, null)).toEqual({ location: true, mobile: true, ready: true });
    expect(listingNeeds(profile, "clear").ready).toBe(false);
    expect(listingNeeds({ ...profile, latitude: null, longitude: null }, null).location).toBe(false);
    expect(listingNeeds({ ...profile, latitude: null, longitude: null }, { latitude: 1, longitude: 2, accuracy: 5 }).location).toBe(true);
    expect(listingNeeds({ ...profile, phoneVerified: false }, null)).toEqual({ location: true, mobile: false, ready: false });
  });
});

describe("trade profile (P12)", () => {
  it("adds an item tidied, never twice, within the server's limits", () => {
    expect(addItem(["Thane"], "  Navi   Mumbai ", AREAS)).toEqual({ list: ["Thane", "Navi Mumbai"], problem: null });
    expect(addItem(["Thane"], "THANE", AREAS)).toEqual({ list: ["Thane"], problem: null });
    expect(addItem([], "   ", AREAS)).toEqual({ list: [], problem: null });
    expect(addItem([], "x".repeat(41), SPECIALTIES).problem).toBe("tooLong");
    const full = Array.from({ length: 12 }, (_, i) => `S${i}`);
    expect(addItem(full, "One more", SPECIALTIES)).toEqual({ list: full, problem: "tooMany" });
  });

  it("reads a whole number, empty as none, anything else as wrong", () => {
    expect(wholeNumber(" 12 ")).toBe(12);
    expect(wholeNumber("")).toBeNull();
    expect(wholeNumber("1.5")).toBeUndefined();
    expect(wholeNumber("-3")).toBeUndefined();
    expect(wholeNumber("12a")).toBeUndefined();
  });

  // The PUT never stores a phone, and an emptied field is cleared with null or [].
  it("sends the trade fields, never a phone", () => {
    const body = tradeBody({ areas: [" Thane ", ""], specialties: [], years: null, dayRate: 1500 });
    expect(body).toEqual({ serviceAreas: ["Thane"], specialties: [], yearsExperience: null, dayRateInr: 1500 });
    expect(body).not.toHaveProperty("phone");
  });

  it("prints a day rate in rupees", () => {
    expect(rupees(150000)).toBe("₹1,50,000");
    expect(rupees(null)).toBe("—");
  });
});
