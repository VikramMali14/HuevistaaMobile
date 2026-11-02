/**
 * Reading a photo's pixels on the phone: PNGs built here by hand — every colour type, every
 * row filter — come back as the RGBA they were made from, and anything the reader can't read
 * is refused rather than read as the wrong colours.
 */
import { zlibSync } from "fflate";

import { decodePng } from "../png";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function chunk(name: string, data: Uint8Array): number[] {
  const length = [(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255];
  // The reader doesn't check CRCs: whatever damaged a file on the phone would show anyway.
  return [...length, ...Array.from(name, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** A PNG of `rows` (raw bytes per row), each row stored with its own filter. */
function png(opts: {
  width: number;
  height: number;
  type: number;
  bpp: number;
  rows: number[][];
  filters: number[];
  depth?: number;
  interlace?: number;
  palette?: number[];
  alphas?: number[];
}): Uint8Array {
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, opts.width);
  new DataView(ihdr.buffer).setUint32(4, opts.height);
  ihdr[8] = opts.depth ?? 8;
  ihdr[9] = opts.type;
  ihdr[12] = opts.interlace ?? 0;
  const stored: number[] = [];
  opts.rows.forEach((row, y) => {
    const prev = y > 0 ? opts.rows[y - 1]! : row.map(() => 0);
    const f = opts.filters[y % opts.filters.length]!;
    stored.push(f);
    row.forEach((v, x) => {
      const a = x >= opts.bpp ? row[x - opts.bpp]! : 0;
      const b = prev[x]!;
      const c = x >= opts.bpp ? prev[x - opts.bpp]! : 0;
      const guess = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      stored.push((v - guess + 256) & 255);
    });
  });
  const idat = zlibSync(new Uint8Array(stored));
  return new Uint8Array([
    ...SIGNATURE,
    ...chunk("IHDR", ihdr),
    ...(opts.palette ? chunk("PLTE", new Uint8Array(opts.palette)) : []),
    ...(opts.alphas ? chunk("tRNS", new Uint8Array(opts.alphas)) : []),
    // Split across two IDATs, as encoders do.
    ...chunk("IDAT", idat.subarray(0, 5)),
    ...chunk("IDAT", idat.subarray(5)),
    ...chunk("IEND", new Uint8Array(0)),
  ]);
}

/** A 5 × 5 RGBA picture with something different in every byte. */
const W = 5, H = 5;
const rgba = Array.from({ length: H }, (_, y) =>
  Array.from({ length: W * 4 }, (_, i) => (i % 4 === 3 ? 200 + y : (y * 53 + i * 31 + (i % 4) * 17) % 256)),
);

describe("decodePng", () => {
  it.each([0, 1, 2, 3, 4])("reads an RGBA photo whose rows are all stored with filter %i", (filter) => {
    const out = decodePng(png({ width: W, height: H, type: 6, bpp: 4, rows: rgba, filters: [filter] }));
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
    expect(Array.from(out.data)).toEqual(rgba.flat());
  });

  it("reads rows stored with a different filter each", () => {
    const out = decodePng(png({ width: W, height: H, type: 6, bpp: 4, rows: rgba, filters: [4, 3, 1, 0, 2] }));
    expect(Array.from(out.data)).toEqual(rgba.flat());
  });

  it("reads an RGB photo as opaque RGBA", () => {
    const rgb = rgba.map((row) => row.filter((_, i) => i % 4 !== 3));
    const out = decodePng(png({ width: W, height: H, type: 2, bpp: 3, rows: rgb, filters: [4, 1] }));
    const want = rgb.flatMap((row) => row.flatMap((v, i) => (i % 3 === 2 ? [v, 255] : [v])));
    expect(Array.from(out.data)).toEqual(want);
  });

  it("reads greys, with and without alpha", () => {
    const grey = [[0, 128, 255], [64, 32, 16]];
    const out = decodePng(png({ width: 3, height: 2, type: 0, bpp: 1, rows: grey, filters: [2] }));
    expect(Array.from(out.data.subarray(0, 8))).toEqual([0, 0, 0, 255, 128, 128, 128, 255]);
    const greyAlpha = [[10, 20, 30, 40], [50, 60, 70, 80]];
    const ga = decodePng(png({ width: 2, height: 2, type: 4, bpp: 2, rows: greyAlpha, filters: [3] }));
    expect(Array.from(ga.data.subarray(0, 8))).toEqual([10, 10, 10, 20, 30, 30, 30, 40]);
  });

  it("reads a palette photo through its palette and its transparency", () => {
    const out = decodePng(
      png({ width: 3, height: 1, type: 3, bpp: 1, rows: [[0, 1, 2]], filters: [0], palette: [11, 22, 33, 44, 55, 66, 77, 88, 99], alphas: [0, 128] }),
    );
    expect(Array.from(out.data)).toEqual([11, 22, 33, 0, 44, 55, 66, 128, 77, 88, 99, 255]);
  });

  it("refuses what it can't read rather than reading the wrong colours", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow("Not a PNG.");
    const sixteen = png({ width: 1, height: 1, type: 6, bpp: 8, rows: [[1, 2, 3, 4, 5, 6, 7, 8]], filters: [0], depth: 16 });
    expect(() => decodePng(sixteen)).toThrow(/8-bit/);
    const interlaced = png({ width: 1, height: 1, type: 6, bpp: 4, rows: [[1, 2, 3, 4]], filters: [0], interlace: 1 });
    expect(() => decodePng(interlaced)).toThrow(/non-interlaced/);
    const badFilter = png({ width: 1, height: 1, type: 6, bpp: 4, rows: [[1, 2, 3, 4]], filters: [9] });
    expect(() => decodePng(badFilter)).toThrow(/filter/);
  });
});
