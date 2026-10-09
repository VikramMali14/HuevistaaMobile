import type { ColourCombo } from "@/api/types";
import type { PaintShade } from "@/lib/shade-types";

import { dockSuggestions } from "../suggested-swatches";

const combo = (main: string, accent: string, trim: string): ColourCombo => ({
  name: `${main}-${accent}`,
  primaryHex: "#111111",
  primaryShade: { shadeCode: main, hvCode: main, hexCode: "#111111" },
  accentHex: "#222222",
  accentShade: { shadeCode: accent, hvCode: accent, hexCode: "#222222" },
  trimHex: "#333333",
  trimShade: { shadeCode: trim, hvCode: trim, hexCode: "#333333" },
});

describe("dockSuggestions", () => {
  it("puts every palette's main colour first, then accents, then trims, each once", () => {
    const out = dockSuggestions([combo("A", "B", "C"), combo("D", "B", "E")], undefined, {});
    expect(out.map((c) => c.code)).toEqual(["A", "D", "B", "C", "E"]);
  });

  it("leaves out what the Recent row already shows, and stops at the limit", () => {
    const out = dockSuggestions([combo("A", "B", "C"), combo("D", "E", "F")], undefined, {}, ["d"], 3);
    expect(out.map((c) => c.code)).toEqual(["A", "B", "E"]);
  });

  it("skips a colour with no shade code", () => {
    const bare: ColourCombo = { name: "x", primaryHex: "#abcdef", accentHex: "#123456", trimHex: "#654321" };
    expect(dockSuggestions([bare], undefined, {})).toEqual([]);
  });

  it("uses the catalogue shade when it has one", () => {
    const shade = { code: "AP1", hvCode: "A", hex: "#0a0b0c", lrv: 42, brandSlug: "asian-paints" } as PaintShade;
    const [first] = dockSuggestions([{ ...combo("A", "B", "C"), primaryShade: { shadeCode: "AP1", hvCode: "A", hexCode: "#111111" } }], [shade], {});
    expect(first).toMatchObject({ hex: "#0a0b0c", lrv: 42, brandSlug: "asian-paints" });
  });
});
