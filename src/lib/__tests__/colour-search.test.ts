/**
 * "Yellow" has to find the yellows — the light ones, the lemon ones, the mustards
 * — whatever they are called, and nothing that a person at a paint counter would
 * call cream, olive or orange instead.
 *
 * The regions in colour-search.ts were set against real reference colours, and
 * this file is where that calibration is written down: a colour a person would
 * put under a word must be found by it, and one they would not must not be.
 */
import { matchesColour, parseColourSearch } from "../colour-search";

const REF = {
  red: "#c1272d", crimson: "#dc143c", brick: "#b22222", maroon: "#800000", burgundy: "#6d1a2e",
  pink: "#ffc0cb", babyPink: "#f4c2c2", hotPink: "#ff69b4", dustyPink: "#d4a5a5",
  orange: "#f28c28", burntOrange: "#cc5500", kesari: "#ff9933", peach: "#f6c9a8", coral: "#ff7f50",
  terracotta: "#c8674a", rust: "#b7410e",
  yellow: "#f5d33f", lemon: "#fff44f", lightYellow: "#fff6a8", butter: "#fff1a8", mustard: "#e1ad01",
  gold: "#d4af37", turmeric: "#e3a52a",
  cream: "#f3e5c0", ivory: "#f6f1e1", offWhite: "#f5f2ea", beige: "#e3d5bb", sand: "#d8c3a0",
  taupe: "#8b7d6b", tan: "#d2b48c", brown: "#8b4513", chocolate: "#5a3a22",
  olive: "#708238", lime: "#c9e265", green: "#4caf50", forest: "#2f4a35", sage: "#9caf88",
  mint: "#b6e5c7", pista: "#a8c686", seaGreen: "#2e8b57",
  teal: "#2f6f73", turquoise: "#40e0d0",
  skyBlue: "#87ceeb", babyBlue: "#bfd7ea", blue: "#3a5ba0", royalBlue: "#4169e1", navy: "#1f2a44",
  steelBlue: "#4682b4", slateBlue: "#6a7b8c",
  purple: "#6a3d7c", violet: "#8f5bb8", plum: "#7d4e6d", lavender: "#c9b8e0", lilac: "#c8a2c8",
  white: "#fafafa", warmWhite: "#f8f4ec", lightGrey: "#d3d3d3", grey: "#9e9e9e", warmGrey: "#a39e93",
  coolGrey: "#8c96a0", charcoal: "#36454f", black: "#1a1612",
} as const;
type Ref = keyof typeof REF;

function found(query: string): Ref[] {
  return (Object.keys(REF) as Ref[]).filter((k) => matchesColour(query, REF[k]));
}

describe("base colours", () => {
  const cases: Array<[string, Ref[], Ref[]]> = [
    ["yellow", ["yellow", "lemon", "lightYellow", "butter", "mustard", "gold", "turmeric"], ["cream", "ivory", "beige", "olive", "orange", "lime", "offWhite"]],
    ["red", ["red", "crimson", "brick", "maroon", "terracotta"], ["pink", "orange", "brown", "peach", "plum"]],
    ["pink", ["pink", "babyPink", "hotPink", "dustyPink"], ["red", "maroon", "peach", "lavender", "beige"]],
    ["orange", ["orange", "burntOrange", "kesari", "coral"], ["yellow", "red", "brown", "peach", "cream"]],
    ["brown", ["brown", "chocolate", "tan", "taupe"], ["orange", "yellow", "red", "beige", "grey"]],
    ["green", ["green", "olive", "lime", "forest", "sage", "mint", "pista", "seaGreen"], ["yellow", "lemon", "teal", "blue", "grey"]],
    ["blue", ["blue", "royalBlue", "navy", "skyBlue", "babyBlue", "steelBlue", "slateBlue", "teal"], ["purple", "green", "grey", "lavender", "mint"]],
    ["purple", ["purple", "violet", "plum", "lavender", "lilac"], ["blue", "royalBlue", "pink", "maroon", "navy"]],
    ["white", ["white", "warmWhite", "offWhite"], ["cream", "lightGrey", "beige", "babyBlue"]],
    ["grey", ["grey", "lightGrey", "warmGrey", "coolGrey", "charcoal"], ["white", "black", "slateBlue", "taupe"]],
    ["black", ["black"], ["charcoal", "navy", "chocolate"]],
  ];
  it.each(cases)("%s finds its own and leaves the neighbours", (q, yes, no) => {
    const hits = found(q);
    for (const k of yes) expect(hits).toContain(k);
    for (const k of no) expect(hits).not.toContain(k);
  });
});

describe("named colours and qualities", () => {
  const cases: Array<[string, Ref[], Ref[]]> = [
    ["light yellow", ["lightYellow", "butter", "lemon", "cream"], ["mustard", "gold", "turmeric", "yellow"]],
    ["lemon yellow", ["lemon"], ["mustard", "cream", "lime", "gold"]],
    ["mustard", ["mustard", "gold", "turmeric"], ["lemon", "lightYellow", "orange", "olive"]],
    ["dark yellow", ["mustard", "gold", "turmeric"], ["lemon", "lightYellow", "butter"]],
    ["cream", ["cream"], ["white", "yellow", "lemon", "tan"]],
    ["off white", ["offWhite", "ivory", "warmWhite", "white"], ["cream", "lightGrey", "beige"]],
    ["beige", ["beige", "sand", "tan"], ["offWhite", "brown", "yellow"]],
    ["sky blue", ["skyBlue", "babyBlue"], ["blue", "navy", "turquoise", "lavender"]],
    ["navy blue", ["navy"], ["blue", "royalBlue", "charcoal", "purple"]],
    ["light blue", ["skyBlue", "babyBlue"], ["blue", "navy", "royalBlue"]],
    ["dark green", ["forest"], ["green", "mint", "lime", "sage"]],
    ["light green", ["mint", "pista", "lime"], ["forest", "olive"]],
    ["olive green", ["olive"], ["lime", "forest", "mint", "yellow"]],
    ["maroon", ["maroon", "burgundy"], ["red", "pink", "plum", "brown"]],
    ["terracotta", ["terracotta"], ["red", "pink", "yellow"]],
    ["teal", ["teal"], ["turquoise", "navy", "green"]],
    ["lavender", ["lavender"], ["purple", "plum", "babyBlue"]],
    ["charcoal", ["charcoal"], ["black", "grey", "navy"]],
    ["warm grey", ["warmGrey"], ["coolGrey", "grey", "lightGrey"]],
    ["cool grey", ["coolGrey"], ["warmGrey", "grey"]],
    ["pastel", ["babyPink", "lavender", "mint", "skyBlue", "peach"], ["red", "navy", "black", "white"]],
  ];
  it.each(cases)("%s", (q, yes, no) => {
    const hits = found(q);
    for (const k of yes) expect(hits).toContain(k);
    for (const k of no) expect(hits).not.toContain(k);
  });

  it("reads a blend as one colour leaning toward the other", () => {
    expect(found("blue green")).toContain("teal");
    expect(found("blue green")).not.toContain("forest");
    expect(found("blue grey")).toContain("slateBlue");
    expect(found("blue grey")).not.toContain("warmGrey");
    expect(parseColourSearch("greenish blue")?.label).toBe("Greenish blue");
    expect(parseColourSearch("grey blue")?.label).toBe("Grey blue");
    // …and offers the named colours inside the blend, not the head's own list.
    expect(parseColourSearch("blue green")?.related).toContain("teal");
  });
});

describe("the words people actually type", () => {
  it("takes plurals, spelling slips and the other spelling of grey", () => {
    for (const q of ["yellows", "yelow", "yello", "YELLOW", "  Yellow  ", "yellow colour", "yellow shades"]) {
      expect(parseColourSearch(q)?.label).toBe("Yellow");
    }
    expect(parseColourSearch("gray")?.label).toBe("Grey");
    expect(parseColourSearch("lavendar")?.label).toBe("Lavender");
    expect(parseColourSearch("off-white")?.label).toBe("Off white");
  });

  it("reads the counter's Hindi, and answers in the colour it names", () => {
    expect(parseColourSearch("peela")?.label).toBe("Yellow");
    expect(parseColourSearch("halka peela")).toBeNull(); // not a word it knows — left as text
    expect(parseColourSearch("laal")?.label).toBe("Red");
    expect(parseColourSearch("aasmani")?.label).toBe("Sky blue");
    expect(parseColourSearch("gulabi")?.label).toBe("Pink");
    expect(found("mehendi")).toContain("olive");
  });

  it("answers while the last word is still being typed", () => {
    expect(parseColourSearch("yel")?.label).toBe("Yellow");
    expect(parseColourSearch("light yel")?.label).toBe("Light yellow");
    // Green or grey? Not until the next letter says.
    expect(parseColourSearch("light gre")?.label).toBe("Light");
    expect(parseColourSearch("gre")).toBeNull();
  });

  it("names the qualities in one order, however they were typed", () => {
    expect(parseColourSearch("yellow light")?.label).toBe("Light yellow");
    expect(parseColourSearch("warm light grey")?.label).toBe("Light warm grey");
  });
});

describe("what is not a colour", () => {
  it("leaves codes, hexes and names alone", () => {
    for (const q of ["HV0348", "L124", "#f5d33f", "f5d33f", "asian paints l124", "Ivory Mist", "harbour blue", "zzzz", "", "   "]) {
      expect(parseColourSearch(q)).toBeNull();
    }
  });

  it("does not guess at a list of three colours", () => {
    expect(parseColourSearch("red blue green")).toBeNull();
  });
});

describe("ranking", () => {
  it("puts the truest example first", () => {
    const yellow = parseColourSearch("yellow")!;
    const s = (k: Ref) => yellow.score(REF[k])!;
    expect(s("yellow")).toBeLessThan(s("mustard"));
    expect(s("yellow")).toBeLessThan(s("lightYellow"));
    const light = parseColourSearch("light yellow")!;
    expect(light.score(REF.lightYellow)!).toBeLessThan(light.score(REF.mustard) ?? Infinity);
  });

  it("does not rank a query that names no colour", () => {
    expect(parseColourSearch("light")?.ranked).toBe(false);
    expect(parseColourSearch("light")?.qualitiesOnly).toBe(true);
    expect(parseColourSearch("yellow")?.ranked).toBe(true);
  });

  it("offers somewhere to go next, and never the same place again", () => {
    const next = parseColourSearch("yellow")!.related;
    expect(next.length).toBeGreaterThan(2);
    expect(next).not.toContain("yellow");
    // Every suggestion reads as a colour, and none is another spelling of the one
    // already on screen ("powder blue" under "sky blue" goes nowhere).
    const QUERIES = [
      "yellow", "red", "pink", "orange", "brown", "green", "blue", "purple", "white", "grey", "black",
      "sky blue", "peach", "rust", "terracotta", "lemon", "mustard", "cream", "beige", "teal", "navy",
      "sage", "lavender", "maroon", "olive", "mint", "charcoal", "off white", "light", "warm",
    ];
    for (const q of QUERIES) {
      const here = parseColourSearch(q)!;
      expect(here).not.toBeNull();
      for (const r of here.related) {
        const there = parseColourSearch(r);
        expect(there).not.toBeNull();
        expect(there!.label).not.toBe(here.label);
      }
    }
  });
});
