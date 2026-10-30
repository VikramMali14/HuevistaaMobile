/**
 * The Shade Book's rules that need no phone: narrowing the book, what the pass would open,
 * when it ends (India's clock, whatever the phone's zone), and a saved picture's name.
 */
import type { ShadeBook, ShadeBookPage } from "@/api/types";

import { NO_FILTER, colourCounts, filterShadeBook, istInstant, lockedPages, msUntilEnd, passEnds, pictureFileName } from "../book";

function page(id: string, photoId: string, codes: string[], title: string): ShadeBookPage {
  return {
    id,
    photoId,
    scope: "EXTERIOR",
    colours: codes.length,
    title,
    sample: false,
    shades: codes.map((code, i) => ({ surfaceId: `part-${i}`, surfaceLabel: `Part ${i}`, shade: { hvCode: code, hexCode: "#C9B79C" } })),
  };
}

const MODERN = page("p1", "exterior-3", ["HV0348", "HV1102", "HV2210"], "Pale beige with deep indigo blue");
const TOWN = page("p2", "exterior-2", ["HV0101", "HV0202"], "Off-white with sage green");

describe("narrowing the book", () => {
  it("lets every page through with no filter", () => {
    expect(filterShadeBook([MODERN, TOWN], NO_FILTER)).toEqual([MODERN, TOWN]);
  });

  it("keeps one house's pages, or one number of colours", () => {
    expect(filterShadeBook([MODERN, TOWN], { ...NO_FILTER, photoId: "exterior-2" })).toEqual([TOWN]);
    expect(filterShadeBook([MODERN, TOWN], { ...NO_FILTER, colours: 3 })).toEqual([MODERN]);
  });

  it("finds a page by a Vista code or a word of its colours, in any case", () => {
    expect(filterShadeBook([MODERN, TOWN], { ...NO_FILTER, query: "hv0202" })).toEqual([TOWN]);
    expect(filterShadeBook([MODERN, TOWN], { ...NO_FILTER, query: "Indigo" })).toEqual([MODERN]);
    expect(filterShadeBook([MODERN, TOWN], { ...NO_FILTER, query: "indigo sage" })).toEqual([]);
  });

  it("offers the numbers of colours there are, fewest first", () => {
    expect(colourCounts([MODERN, TOWN, MODERN])).toEqual([2, 3]);
  });
});

describe("what the pass would open", () => {
  const book = (open: boolean, total: number, shown: number): Pick<ShadeBook, "total" | "combinations" | "access"> => ({
    total,
    combinations: Array.from({ length: shown }, () => MODERN),
    access: { open, reason: open ? "PASS" : "NONE", pricePaise: 4900, currency: "INR", hours: 24, purchasable: true },
  });

  it("counts the pages a reader without the pass isn't sent, and none once it runs", () => {
    expect(lockedPages(book(false, 227, 3))).toBe(224);
    expect(lockedPages(book(true, 227, 227))).toBe(0);
  });
});

describe("when the pass ends", () => {
  it("reads the server's zone-less time as India's", () => {
    expect(istInstant("2026-10-31T16:05:00")?.toISOString()).toBe("2026-10-31T10:35:00.000Z");
    expect(istInstant("2026-10-31T10:35:00Z")?.toISOString()).toBe("2026-10-31T10:35:00.000Z");
    expect(istInstant("soon")).toBeNull();
    expect(istInstant(null)).toBeNull();
  });

  it("says it in India's time", () => {
    expect(passEnds("2026-10-31T16:05:00")).toMatch(/31 Oct/);
    expect(passEnds("2026-10-31T16:05:00")).toMatch(/4:05\s?pm/i);
    expect(passEnds(undefined)).toBeNull();
  });

  it("counts down to it, and stops at nought", () => {
    const at = Date.parse("2026-10-31T10:00:00Z");
    expect(msUntilEnd("2026-10-31T16:05:00", at)).toBe(35 * 60_000);
    expect(msUntilEnd("2026-10-30T16:05:00", at)).toBe(0);
    expect(msUntilEnd(null, at)).toBeNull();
  });
});

describe("a saved picture's name", () => {
  it("carries the page's Vista codes, as the server names it", () => {
    expect(pictureFileName(MODERN)).toBe("huevistaa-shade-book-HV0348-HV1102-HV2210.jpg");
  });

  it("leaves out anything that isn't a plain code", () => {
    expect(pictureFileName(page("x", "exterior-2", ["../HV1", ""], "x"))).toBe("huevistaa-shade-book.jpg");
  });
});
