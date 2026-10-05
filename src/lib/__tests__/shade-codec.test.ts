import { decodeShades, encodeShades } from "../shade-codec";
import { SHADES } from "../__fixtures__/sample-shades";
import type { PaintShade } from "../shade-types";

const shade = (over: Partial<PaintShade> = {}): PaintShade => ({
  code: "MPHVK-2230",
  hvCode: "HV1144",
  name: "Terracotta Rose",
  hex: "#c9714f",
  family: "Reds & Terracottas",
  lrv: 28,
  brand: "Mehta Premium Emulsion",
  finishes: ["Matt", "Satin", "Soft sheen"],
  ...over,
});

describe("encodeShades / decodeShades", () => {
  it("round-trips a shade exactly", () => {
    expect(decodeShades(encodeShades([shade()]))).toEqual([shade()]);
  });

  it("round-trips the whole bundled catalogue", () => {
    // The sample palette is the real shape of the data: several companies, several
    // families, shades with and without an hv code, finish lists of different lengths.
    expect(decodeShades(encodeShades(SHADES))).toEqual(
      SHADES.map((s) => ({ ...s, hvCode: s.hvCode ?? null, finishes: [...s.finishes] })),
    );
  });

  it("keeps the order it was given", () => {
    const list = [shade({ code: "A" }), shade({ code: "B" }), shade({ code: "C" })];
    expect(decodeShades(encodeShades(list)).map((s) => s.code)).toEqual(["A", "B", "C"]);
  });

  it("round-trips an empty catalogue", () => {
    expect(decodeShades(encodeShades([]))).toEqual([]);
  });

  it("keeps a missing hv code missing rather than inventing an empty one", () => {
    // A shade with no hvCode falls back to its manufacturer code everywhere it is
    // shown, and "" is not a falsy value in every one of those places.
    const [out] = decodeShades(encodeShades([shade({ hvCode: null })]));
    expect(out!.hvCode).toBeNull();
    const [undef] = decodeShades(encodeShades([shade({ hvCode: undefined })]));
    expect(undef!.hvCode).toBeNull();
  });

  it("survives the separators appearing inside a shade name", () => {
    const odd = shade({ name: "Blue | Green\\Grey", family: "Odd | Ones", code: "A|B" });
    const [out] = decodeShades(encodeShades([odd]));
    expect(out).toEqual(odd);
  });

  it("survives a newline inside a shade name", () => {
    // A row IS a line, so a stray newline out of the backend would otherwise shift
    // every shade after it by one.
    const odd = shade({ name: "Two\nLines" });
    const list = [odd, shade({ code: "AFTER" })];
    const out = decodeShades(encodeShades(list));
    expect(out).toHaveLength(2);
    expect(out[0]!.name).toBe("Two\nLines");
    expect(out[1]!.code).toBe("AFTER");
  });

  it("handles a shade with no finishes listed", () => {
    const [out] = decodeShades(encodeShades([shade({ finishes: [] })]));
    expect(out!.finishes).toEqual([]);
  });

  it("pools the repeated columns, so a big catalogue is far smaller than its JSON", () => {
    // The whole point of the format. A real catalogue repeats a few dozen company,
    // family and finish values across thousands of rows.
    const many = Array.from({ length: 2000 }, (_, i) =>
      shade({ code: `MPHVK-${i}`, hvCode: `HV${i}`, name: `Shade Number ${i}` }),
    );
    const packed = encodeShades(many);
    expect(packed.length).toBeLessThan(JSON.stringify(many).length / 2);
    expect(decodeShades(packed)).toHaveLength(2000);
  });

  it("answers with an empty catalogue for anything it does not recognise", () => {
    // Never a half-parsed one: an empty catalogue is a state the studio explains,
    // whereas invented codes would be printed on a colour board and taken to a counter.
    expect(decodeShades("")).toEqual([]);
    expect(decodeShades(null)).toEqual([]);
    expect(decodeShades(undefined)).toEqual([]);
    expect(decodeShades("hvshades0\n\n\n")).toEqual([]);
    expect(decodeShades(JSON.stringify([shade()]))).toEqual([]);
  });

  it("skips a truncated row rather than filling it in", () => {
    const packed = encodeShades([shade({ code: "GOOD" })]);
    expect(decodeShades(`${packed}\nBROKEN|ROW`)).toHaveLength(1);
  });
});
