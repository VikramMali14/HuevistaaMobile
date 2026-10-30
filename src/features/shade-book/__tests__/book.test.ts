/**
 * The Shade Book's rules that need no phone: which photo it opens on, which combinations a
 * photo can take, what the pass would open, which colour goes on which part of another photo,
 * when the pass ends (India's clock), and a saved picture's name.
 */
import type { ShadeBook, ShadeBookPage, ShadeBookPhoto } from "@/api/types";

import { combinationsFor, firstPhoto, istInstant, lockedFor, msUntilEnd, partsOn, passEnds, pictureFileName, searchShadeBook } from "../book";

const photo = (id: string, kind: "INTERIOR" | "EXTERIOR", surfaces: string[]): ShadeBookPhoto => ({
  id,
  kind,
  title: id,
  width: 800,
  height: 600,
  version: "1",
  surfaces: surfaces.map((s) => ({ id: s, label: s })),
});
const LIVING = photo("interior-2", "INTERIOR", ["walls", "ceiling"]);
const SITTING = photo("interior-3", "INTERIOR", ["main-walls", "feature-wall", "ceiling"]);
const TOWN = photo("exterior-2", "EXTERIOR", ["main-walls", "highlight-walls"]);
const MODERN = photo("exterior-3", "EXTERIOR", ["main-walls", "frame", "band"]);

function page(id: string, on: ShadeBookPhoto, hexes: string[], codes: string[], title = "A combination"): ShadeBookPage {
  return {
    id,
    photoId: on.id,
    scope: on.kind,
    colours: hexes.length,
    title,
    sample: false,
    shades: hexes.map((hex, i) => ({ surfaceId: on.surfaces[i]!.id, surfaceLabel: on.surfaces[i]!.label, shade: { hvCode: codes[i], hexCode: hex } })),
  };
}

const HOUSE3 = page("p1", MODERN, ["#E8DCC8", "#4F4D5A", "#F4F2EC"], ["HV0348", "HV1102", "HV2210"], "Pale beige with deep indigo blue");
const HOUSE2 = page("p2", TOWN, ["#F4F2EC", "#4F4D5A"], ["HV0101", "HV0202"], "Off-white with sage green");
const ROOM3 = page("p3", SITTING, ["#E8DCC8", "#8C5F3B", "#F4F2EC"], ["HV0400", "HV0500", "HV0600"], "Cream with teak");

describe("choosing what to paint", () => {
  it("opens on the photo the book's first page was made for", () => {
    expect(firstPhoto({ photos: [LIVING, SITTING, TOWN, MODERN], combinations: [HOUSE3] })?.id).toBe("exterior-3");
    expect(firstPhoto({ photos: [LIVING, SITTING, TOWN, MODERN], combinations: [] })?.id).toBe("interior-2");
  });

  it("offers a photo every combination with as many colours as it has parts, its own kind first", () => {
    expect(combinationsFor([HOUSE3, HOUSE2, ROOM3], SITTING).map((p) => p.id)).toEqual(["p3", "p1"]);
    expect(combinationsFor([HOUSE3, HOUSE2, ROOM3], LIVING).map((p) => p.id)).toEqual(["p2"]);
  });

  it("finds a combination by a Vista code or a word of its colours", () => {
    expect(searchShadeBook([HOUSE3, ROOM3], "hv0500").map((p) => p.id)).toEqual(["p3"]);
    expect(searchShadeBook([HOUSE3, ROOM3], "Indigo").map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("what the pass would open", () => {
  const book: Pick<ShadeBook, "access" | "totals" | "combinations"> = {
    access: { open: false, reason: "NONE", pricePaise: 4900, currency: "INR", hours: 24, purchasable: true },
    totals: { "2": 12, "3": 227 },
    combinations: [HOUSE3, HOUSE2],
  };

  it("counts, for each number of colours, what a reader without the pass isn't sent — and none once it runs", () => {
    expect(lockedFor(book, 3)).toBe(226);
    expect(lockedFor(book, 2)).toBe(11);
    expect(lockedFor({ ...book, access: { ...book.access, open: true } }, 3)).toBe(0);
  });
});

/** The server's rule for a page on another photo, so the codes match the picture. */
describe("a combination on another photo", () => {
  it("keeps the main walls, and puts the lighter of the others on a ceiling it wasn't made for", () => {
    const room = partsOn(HOUSE3, SITTING)!;
    expect(room.map((p) => [p.surfaceId, p.shade.hvCode])).toEqual([
      ["main-walls", "HV0348"],
      ["feature-wall", "HV1102"],
      ["ceiling", "HV2210"],
    ]);
  });

  it("puts the lighter colour on a ceiling, as rooms are, when the photos share no part", () => {
    expect(partsOn(HOUSE2, LIVING)!.map((p) => [p.surfaceId, p.shade.hvCode])).toEqual([
      ["walls", "HV0202"],
      ["ceiling", "HV0101"],
    ]);
  });

  it("keeps its own parts on its own photo, and has nothing for a different number of parts", () => {
    expect(partsOn(HOUSE3, MODERN)).toBe(HOUSE3.shades);
    expect(partsOn(HOUSE3, TOWN)).toBeNull();
  });
});

describe("when the pass ends", () => {
  it("reads the server's zone-less time as India's", () => {
    expect(istInstant("2026-10-31T16:05:00")?.toISOString()).toBe("2026-10-31T10:35:00.000Z");
    expect(istInstant("2026-10-31T10:35:00Z")?.toISOString()).toBe("2026-10-31T10:35:00.000Z");
    expect(istInstant("soon")).toBeNull();
  });

  it("says it in India's time, and counts down to it", () => {
    expect(passEnds("2026-10-31T16:05:00")).toMatch(/31 Oct/);
    expect(passEnds("2026-10-31T16:05:00")).toMatch(/4:05\s?pm/i);
    const at = Date.parse("2026-10-31T10:00:00Z");
    expect(msUntilEnd("2026-10-31T16:05:00", at)).toBe(35 * 60_000);
    expect(msUntilEnd("2026-10-30T16:05:00", at)).toBe(0);
  });
});

describe("a saved picture's name", () => {
  it("carries the page's Vista codes, as the server names it, and nothing that isn't one", () => {
    expect(pictureFileName(HOUSE3)).toBe("huevistaa-shade-book-HV0348-HV1102-HV2210.jpg");
    expect(pictureFileName(page("x", TOWN, ["#FFFFFF", "#000000"], ["../x", ""]))).toBe("huevistaa-shade-book.jpg");
  });
});
