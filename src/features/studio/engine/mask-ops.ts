import { zlibSync } from "fflate";

/** A point on the photo, in its own pixels (0,0 at the top left). */
export type Point = readonly [number, number];

/** One edit to a wall's mask (C10): a brush or eraser stroke, or a filled straight-edged shape. */
export type MaskOp =
  | { kind: "stroke"; add: boolean; radius: number; points: Point[] }
  | { kind: "shape"; add: boolean; points: Point[] };

const CIRCLE_SEGMENTS = 20;

/** Photo pixels → clip space, with row 0 of the target at the top of the photo. */
function clip(x: number, y: number, w: number, h: number): [number, number] {
  return [(x / w) * 2 - 1, (y / h) * 2 - 1];
}

/**
 * The triangles of a brush stroke: a disc at every point, and a quad joining each pair, so
 * a fast stroke is a solid band rather than a row of beads. Clip-space x,y pairs.
 */
export function strokeTriangles(points: readonly Point[], radius: number, w: number, h: number): Float32Array {
  const out: number[] = [];
  const push = (x: number, y: number) => out.push(...clip(x, y, w, h));
  for (const [cx, cy] of points) {
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a0 = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      const a1 = ((i + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;
      push(cx, cy);
      push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius);
      push(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius);
    }
  }
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const nx = (-(y1 - y0) / len) * radius;
    const ny = ((x1 - x0) / len) * radius;
    push(x0 + nx, y0 + ny);
    push(x1 + nx, y1 + ny);
    push(x1 - nx, y1 - ny);
    push(x0 + nx, y0 + ny);
    push(x1 - nx, y1 - ny);
    push(x0 - nx, y0 - ny);
  }
  return new Float32Array(out);
}

function area(points: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Split a simple polygon (the corners tapped with the Shape tool, in order) into
 * triangles by ear clipping — so an L-shaped wall fills as an L, not as its hull.
 * Returns index triples into `points`; nothing for fewer than three corners.
 */
export function triangulate(points: readonly Point[]): number[] {
  const n = points.length;
  if (n < 3) return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  if (area(points) < 0) idx.reverse();
  const tris: number[] = [];
  let guard = n * n;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length]!;
      const ib = idx[i]!;
      const ic = idx[(i + 1) % idx.length]!;
      const a = points[ia]!;
      const b = points[ib]!;
      const c = points[ic]!;
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 0) continue; // a reflex corner is not an ear
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inTriangle(points[j]!, a, b, c))) continue;
      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // self-crossing: fill what was found
  }
  if (idx.length === 3) tris.push(idx[0]!, idx[1]!, idx[2]!);
  return tris;
}

/** A filled shape's triangles in clip space. */
export function shapeTriangles(points: readonly Point[], w: number, h: number): Float32Array {
  const out: number[] = [];
  for (const i of triangulate(points)) out.push(...clip(points[i]![0], points[i]![1], w, h));
  return new Float32Array(out);
}

/** The brush sizes, as a share of the photo's longest side. */
export const BRUSH_SIZES = { small: 0.012, medium: 0.025, large: 0.05 } as const;
export type BrushSize = keyof typeof BRUSH_SIZES;

export function brushRadius(size: BrushSize, photo: { width: number; height: number }): number {
  return Math.max(2, Math.round(BRUSH_SIZES[size] * Math.max(photo.width, photo.height)));
}

// ── PNG ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * A wall's mask as the backend takes it: an 8-bit greyscale PNG, white where the wall is,
 * at the photo's own size. `coverage` is one byte a pixel, top row first. Rows use the
 * "Up" filter — a mask is mostly the row above it — so a full-size mask packs to tens of
 * kilobytes.
 */
export function encodeMaskPng(coverage: Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    raw[row] = 2; // Up
    for (let x = 0; x < width; x++) {
      const v = coverage[y * width + x]!;
      const above = y > 0 ? coverage[(y - 1) * width + x]! : 0;
      raw[row + 1 + x] = (v - above) & 0xff;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw, { level: 6 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** The red channel of an RGBA read-back, made hard: 255 inside the wall, 0 outside. */
export function coverageOf(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]! >= 128 ? 255 : 0;
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without relying on btoa (not on every JS engine a phone runs). */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + "==";
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + "=";
  }
  return out;
}
