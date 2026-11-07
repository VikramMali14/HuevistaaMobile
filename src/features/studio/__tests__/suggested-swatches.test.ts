import type { ColourCombo, ShadeBookPage } from "@/api/types";
import type { PaintShade } from "@/lib/shade-types";

import { comboColours, dockSuggestions, pageColours, scopeOf } from "../suggested-swatches";

describe("comboColours (Vista AI)", () => {
  const combo: ColourCombo = {
    name: "Garden",
    primaryHex: "#111111",
    primaryShade: { shadeCode: "AP1", hvCode: "A", hexCode: "#111111" },
    accentHex: "#222222",
    accentShade: { shadeCode: "B", hvCode: "B", hexCode: "#222222" },
    trimHex: "#333333",
  };

  it("gives main, accent and trim in that order, the catalogue's shade where it has one", () => {
    const shade = { code: "AP1", hvCode: "A", hex: "#0a0b0c", lrv: 42, brandSlug: "asian-paints" } as PaintShade;
    const [main, accent, trim] = comboColours(combo, [shade], {});
    expect(main).toMatchObject({ hex: "#0a0b0c", lrv: 42, brandSlug: "asian-paints" });
    // Not in the catalogue: the matched shade's own colour and Vista code.
    expect(accent).toMatchObject({ hex: "#222222", code: "B", lrv: null });
    // No matched shade at all: the bare colour, with no code to save.
    expect(trim).toMatchObject({ hex: "#333333", code: null });
  });
});

const page = (...codes: string[]): ShadeBookPage => ({
  id: codes.join("-"),
  photoId: "interior-2",
  scope: "INTERIOR",
  colours: codes.length,
  title: codes.join(" + "),
  sample: true,
  shades: codes.map((code, i) => ({ surfaceId: `s${i}`, surfaceLabel: `Part ${i + 1}`, shade: { hvCode: code, hexCode: "#111111" } })),
});

describe("dockSuggestions", () => {
  it("puts every combination's first colour first, then the second, then the third, each once", () => {
    const out = dockSuggestions([page("A", "B", "C"), page("D", "B", "E")], undefined, {});
    expect(out.map((c) => c.code)).toEqual(["A", "D", "B", "C", "E"]);
  });

  it("leaves out what the Recent row already shows, and stops at the limit", () => {
    const out = dockSuggestions([page("A", "B", "C"), page("D", "E", "F")], undefined, {}, ["d"], 3);
    expect(out.map((c) => c.code)).toEqual(["A", "B", "E"]);
  });

  it("skips a colour with no shade code", () => {
    const bare: ShadeBookPage = { ...page("A"), shades: [{ surfaceId: "s", surfaceLabel: "Walls", shade: { hexCode: "#abcdef" } }] };
    expect(dockSuggestions([bare], undefined, {})).toEqual([]);
  });

  it("mixes two-colour and three-colour combinations", () => {
    const out = dockSuggestions([page("A", "B"), page("C", "D", "E")], undefined, {});
    expect(out.map((c) => c.code)).toEqual(["A", "C", "B", "D", "E"]);
  });
});

describe("pageColours", () => {
  it("uses the catalogue shade when it has one, found by its Vista code", () => {
    const shade = { code: "AP1", hvCode: "A", hex: "#0a0b0c", lrv: 42, brandSlug: "asian-paints" } as PaintShade;
    const [first] = pageColours(page("A", "B"), [shade], {});
    expect(first).toMatchObject({ hex: "#0a0b0c", lrv: 42, brandSlug: "asian-paints" });
  });
});

describe("scopeOf", () => {
  it("reads an outdoor photo as exterior and anything else as interior", () => {
    expect(scopeOf("OUTDOOR")).toBe("EXTERIOR");
    expect(scopeOf("EXTERIOR")).toBe("EXTERIOR");
    expect(scopeOf("INDOOR")).toBe("INTERIOR");
    expect(scopeOf(null)).toBe("INTERIOR");
  });
});
