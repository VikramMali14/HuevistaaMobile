/**
 * The Colour Combination Book's rules that need no phone: what a filter keeps, which houses a combination is
 * shown on, what the pass would open, which colour goes on which part of another photo, when the
 * pass ends (India's clock), and a saved picture's name.
 */
import type { ShadeBook, ShadeBookPage, ShadeBookPhoto } from "@/api/types";
import { shadeBookPhotoPath, shadeBookPicturePath } from "@/api/endpoints/shade-book";

import {
  NO_FILTER,
  SHADE_FAMILIES,
  bookHouses,
  familyCounts,
  filterFromParams,
  filterShadeBook,
  gridPages,
  gridParams,
  housesFor,
  housesWhere,
  istInstant,
  lockedFor,
  msUntilEnd,
  ownHouse,
  pagesOn,
  partsOn,
  passEnds,
  pictureFileName,
  searchShadeBook,
} from "../book";

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
/** Houses the team added: a three-part bungalow and a two-part bedroom. */
const BUNGALOW = photo("house-k3x9q2mf", "EXTERIOR", ["main-walls", "highlight-walls", "frame"]);
const BEDROOM = photo("house-a1b2c3d4", "INTERIOR", ["main-walls", "feature-wall"]);
/** The book's own: the sitting room with its two walls alone. */
const TWO_WALLS = photo("interior-2w", "INTERIOR", ["main-walls", "feature-wall"]);
const HOUSES = [LIVING, SITTING, TOWN, MODERN, BUNGALOW, BEDROOM];

function page(id: string, on: ShadeBookPhoto, hexes: string[], codes: string[], title = "A combination", families: string[] = []): ShadeBookPage {
  return {
    id,
    photoId: on.id,
    scope: on.kind,
    colours: hexes.length,
    title,
    sample: false,
    shades: hexes.map((hex, i) => ({ surfaceId: on.surfaces[i]!.id, surfaceLabel: on.surfaces[i]!.label, shade: { hvCode: codes[i], hexCode: hex } })),
    families,
  };
}

const HOUSE3 = page("p1", MODERN, ["#E8DCC8", "#4F4D5A", "#F4F2EC"], ["HV0348", "HV1102", "HV2210"], "Pale beige with deep indigo blue", ["beige", "blue", "white"]);
const HOUSE2 = page("p2", TOWN, ["#F4F2EC", "#4F4D5A"], ["HV0101", "HV0202"], "Off-white with sage green", ["white", "blue"]);
const ROOM3 = page("p3", SITTING, ["#E8DCC8", "#8C5F3B", "#F4F2EC"], ["HV0400", "HV0500", "HV0600"], "Cream with teak", ["beige", "brown", "white"]);
const GREY2 = page("p4", TOWN, ["#B7B5B0", "#6A6E6B"], ["HV0700", "HV0800"], "Light grey with grey", ["grey"]);
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("choosing what to look at", () => {
  const ALL = [HOUSE3, HOUSE2, ROOM3, GREY2];

  it("reads every house the team added, or the colour test's four from an older server", () => {
    expect(bookHouses({ photos: [LIVING, SITTING, TOWN, MODERN], houses: HOUSES })).toHaveLength(6);
    expect(ids(bookHouses({ photos: [LIVING, SITTING, TOWN, MODERN] }))).toEqual(["interior-2", "interior-3", "exterior-2", "exterior-3"]);
  });

  it("narrows the book to exterior or interior, two colours or three, and the colour families chosen", () => {
    expect(ids(filterShadeBook(ALL, NO_FILTER))).toEqual(["p1", "p2", "p3", "p4"]);
    expect(ids(filterShadeBook(ALL, { ...NO_FILTER, kind: "INTERIOR" }))).toEqual(["p3"]);
    expect(ids(filterShadeBook(ALL, { ...NO_FILTER, kind: "EXTERIOR", colours: 2 }))).toEqual(["p2", "p4"]);
    expect(ids(filterShadeBook(ALL, { ...NO_FILTER, families: ["blue"] }))).toEqual(["p1", "p2"]);
    expect(ids(filterShadeBook(ALL, { ...NO_FILTER, families: ["blue", "beige"] }))).toEqual(["p1"]);
    expect(ids(filterShadeBook([{ ...GREY2, families: undefined }], { ...NO_FILTER, families: ["grey"] }))).toEqual([]);
  });

  it("finds a combination by a Vista code or a word of its colours", () => {
    expect(ids(searchShadeBook([HOUSE3, ROOM3], "hv0500"))).toEqual(["p3"]);
    expect(ids(searchShadeBook([HOUSE3, ROOM3], "Indigo"))).toEqual(["p1"]);
    expect(ids(filterShadeBook([HOUSE3, ROOM3], { ...NO_FILTER, kind: "EXTERIOR", query: "hv0500" }))).toEqual([]);
  });

  it("shows a combination on every house with as many parts — its own first, then its kind, then the rest", () => {
    expect(ids(housesFor(HOUSE3, HOUSES))).toEqual(["exterior-3", "house-k3x9q2mf", "interior-3"]);
    expect(ids(housesFor(HOUSE2, HOUSES))).toEqual(["exterior-2", "interior-2", "house-a1b2c3d4"]);
    expect(ids(housesFor(HOUSE2, HOUSES, "INTERIOR"))).toEqual(["interior-2", "house-a1b2c3d4"]);
    expect(ids(housesWhere(HOUSES, { kind: "EXTERIOR", colours: 3 }))).toEqual(["exterior-3", "house-k3x9q2mf"]);
  });

  it("puts a room's two wall colours on a ceiling only when the lighter is light enough for one", () => {
    const rooms = [LIVING, SITTING, TWO_WALLS, BEDROOM];
    const greyBlue = page("w1", TWO_WALLS, ["#A7A3A5", "#3C5370"], ["HV3001", "HV3002"]);
    expect(ids(housesFor(greyBlue, rooms))).toEqual(["interior-2w", "house-a1b2c3d4"]);
    const whiteBlue = page("w2", TWO_WALLS, ["#F3F2EC", "#3C5370"], ["HV3003", "HV3002"]);
    expect(ids(housesFor(whiteBlue, rooms))).toEqual(["interior-2w", "interior-2", "house-a1b2c3d4"]);
    // An exterior scheme whose frame and band are deep stays off the sitting room's ceiling.
    const deep = page("d1", MODERN, ["#B7B5B0", "#6A6E6B", "#4F4D5A"], ["HV4001", "HV4002", "HV4003"]);
    expect(ids(housesFor(deep, HOUSES))).toEqual(["exterior-3", "house-k3x9q2mf"]);
  });

  it("shows a combination on its own photo until a house is chosen — or the first it fits, should that one have gone", () => {
    expect(ownHouse(HOUSE3, HOUSES)?.id).toBe("exterior-3");
    expect(ownHouse(HOUSE3, [SITTING, BUNGALOW])?.id).toBe("house-k3x9q2mf");
    expect(ownHouse(HOUSE2, [SITTING, MODERN])).toBeUndefined();
  });

  it("paints on the house chosen every combination it fits — those made on it first, then its kind, then the rest", () => {
    expect(ids(pagesOn(ALL, BUNGALOW))).toEqual(["p1", "p3"]);
    expect(ids(pagesOn(ALL, SITTING))).toEqual(["p3", "p1"]);
    // A room's ceiling takes a light colour: a grey pair would put its lighter grey up there.
    expect(ids(pagesOn(ALL, LIVING))).toEqual(["p2"]);
    const deep = page("d1", MODERN, ["#B7B5B0", "#6A6E6B", "#4F4D5A"], ["HV4001", "HV4002", "HV4003"]);
    expect(ids(pagesOn([deep, HOUSE3], SITTING))).toEqual(["p1"]);
  });

  it("reads the grid alike on the screen and on a picture opened from it, its filter and house in the route", () => {
    const book = { photos: [LIVING, SITTING, TOWN, MODERN], houses: HOUSES, combinations: ALL };
    const twoColours = { ...NO_FILTER, colours: 2 as const };
    expect(gridPages(book, twoColours, "interior-2")).toEqual({ house: LIVING, pages: [HOUSE2] });
    // A house the filter no longer keeps: each on its own again.
    expect(ids(gridPages(book, twoColours, "exterior-3").pages)).toEqual(["p2", "p4"]);
    expect(gridPages(book, twoColours, "exterior-3").house).toBeNull();

    const filter = { kind: "EXTERIOR" as const, colours: 3 as const, families: ["blue", "beige"], query: " hv03 " };
    const params = gridParams(filter, "house-k3x9q2mf");
    expect(params).toEqual({ on: "house-k3x9q2mf", kind: "EXTERIOR", colours: "3", families: "blue,beige", q: "hv03" });
    expect(filterFromParams(params)).toEqual({ ...filter, query: "hv03" });
    expect(gridParams(NO_FILTER, null)).toEqual({});
    // Whatever a link carries that isn't a filter is left as the whole book's.
    expect(filterFromParams({ kind: "ROOF", colours: "4", families: "blue,teal", q: ["x", "y"] })).toEqual({ ...NO_FILTER, families: ["blue"], query: "x" });
  });

  it("paints a page small on each house, and shows the colour test's four by their own address", () => {
    expect(shadeBookPicturePath(HOUSE3, BUNGALOW, "mini")).toBe("/api/shade-book/p1/image?size=mini&photo=house-k3x9q2mf&v=1");
    expect(shadeBookPhotoPath(LIVING)).toBe("/api/colour-test/interior-2/photo?v=1");
    expect(shadeBookPhotoPath(BEDROOM)).toBe("/api/shade-book/houses/house-a1b2c3d4/photo?v=1");
    expect(shadeBookPhotoPath(TWO_WALLS)).toBe("/api/shade-book/houses/interior-2w/photo?v=1");
  });
});

describe("what the pass would open", () => {
  const book: Pick<ShadeBook, "access" | "total" | "totals" | "facets" | "combinations"> = {
    access: { open: false, reason: "NONE", pricePaise: 4900, currency: "INR", hours: 24, purchasable: true },
    total: 239,
    totals: { "2": 12, "3": 227 },
    facets: [
      { scope: "EXTERIOR", colours: 3, families: ["white", "beige", "blue"], count: 40 },
      { scope: "EXTERIOR", colours: 3, families: ["grey"], count: 187 },
      { scope: "EXTERIOR", colours: 2, families: ["white", "blue"], count: 12 },
    ],
    combinations: [HOUSE3, HOUSE2],
  };

  it("counts what fits the filter that a reader without the pass isn't sent — and none once it runs", () => {
    expect(lockedFor(book, NO_FILTER)).toBe(237);
    expect(lockedFor(book, { ...NO_FILTER, colours: 3 })).toBe(226);
    expect(lockedFor(book, { ...NO_FILTER, colours: 2 })).toBe(11);
    expect(lockedFor(book, { ...NO_FILTER, families: ["blue"] })).toBe(50);
    expect(lockedFor(book, { ...NO_FILTER, kind: "INTERIOR" })).toBe(0);
    expect(lockedFor({ ...book, access: { ...book.access, open: true } }, NO_FILTER)).toBe(0);
  });

  it("counts by colours alone from an older server", () => {
    expect(lockedFor({ ...book, facets: undefined }, { ...NO_FILTER, colours: 3 })).toBe(226);
    expect(lockedFor({ ...book, facets: undefined }, { ...NO_FILTER, families: ["blue"] })).toBe(0);
  });

  it("puts on each family's chip how many in the whole book it would show", () => {
    const counts = familyCounts(book, NO_FILTER);
    expect(counts.blue).toBe(52);
    expect(counts.grey).toBe(187);
    expect(counts.green).toBe(0);
    expect(familyCounts(book, { ...NO_FILTER, families: ["blue"], colours: 2 }).beige).toBe(0);
    expect(Object.keys(counts)).toEqual(SHADE_FAMILIES.map((f) => f.id));
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
