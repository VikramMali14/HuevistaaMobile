/// <reference types="node" />
import { PNG } from "pngjs";

import { brushRadius, coverageOf, encodeMaskPng, shapeTriangles, strokeTriangles, toBase64, triangulate, type Point } from "../mask-ops";

function triangleArea(points: readonly Point[], tris: number[]): number {
  let total = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [points[tris[i]!]!, points[tris[i + 1]!]!, points[tris[i + 2]!]!];
    total += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  return total;
}

describe("mask PNG", () => {
  it("is a greyscale PNG the backend can read, white where the wall is", () => {
    const w = 37;
    const h = 21;
    const cov = new Uint8Array(w * h);
    for (let y = 5; y < 15; y++) for (let x = 10; x < 30; x++) cov[y * w + x] = 255;
    const png = PNG.sync.read(Buffer.from(encodeMaskPng(cov, w, h)));
    expect([png.width, png.height]).toEqual([w, h]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(png.data[(y * w + x) * 4]).toBe(cov[y * w + x]);
      }
    }
  });

  it("packs a full-size mask well under the backend's limit", () => {
    const w = 2048;
    const h = 1536;
    const cov = new Uint8Array(w * h);
    for (let y = 200; y < 1200; y++) for (let x = 300; x < 1700 - (y >> 2); x++) cov[y * w + x] = 255;
    const b64 = toBase64(encodeMaskPng(cov, w, h));
    expect(b64.length).toBeLessThan(400_000);
  });

  it("encodes base64 exactly as Node does, at every padding length", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });

  it("reads coverage from the red channel, hard-edged", () => {
    expect([...coverageOf(new Uint8Array([200, 0, 0, 255, 100, 0, 0, 255]), 2, 1)]).toEqual([255, 0]);
  });
});

describe("shapes", () => {
  it("fills an L-shaped wall as an L, not as its hull", () => {
    const l: Point[] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const tris = triangulate(l);
    expect(tris.length / 3).toBe(4);
    expect(triangleArea(l, tris)).toBeCloseTo(64);
  });

  it("works whichever way round the corners were tapped", () => {
    const square: Point[] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ];
    expect(triangleArea(square, triangulate(square))).toBeCloseTo(100);
  });

  it("needs three corners", () => {
    expect(triangulate([[0, 0], [5, 5]])).toEqual([]);
    expect(shapeTriangles([[0, 0], [5, 5]], 10, 10)).toHaveLength(0);
  });

  it("puts the photo's top left at the target's first row", () => {
    const tri = shapeTriangles(
      [
        [0, 0],
        [100, 0],
        [0, 50],
      ],
      100,
      50,
    );
    expect(Array.from(tri.slice(0, 2))).toEqual([-1, -1]);
  });
});

describe("strokes", () => {
  it("joins the points so a fast stroke is a solid band", () => {
    const one = strokeTriangles([[10, 10]], 5, 100, 100);
    const two = strokeTriangles(
      [
        [10, 10],
        [60, 10],
      ],
      5,
      100,
      100,
    );
    // Two discs plus one joining quad (two triangles).
    expect(two.length).toBe(one.length * 2 + 12);
  });

  it("sizes the brush to the photo", () => {
    expect(brushRadius("medium", { width: 2048, height: 1536 })).toBe(51);
    expect(brushRadius("small", { width: 100, height: 80 })).toBe(2);
  });
});
