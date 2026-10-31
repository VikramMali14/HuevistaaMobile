import { unzlibSync } from "fflate";

/** A photo as pixels: RGBA, row by row, the shape the website's canvas hands its sampler. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Channels a pixel carries, by PNG colour type: grey, RGB, palette, grey + alpha, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * A PNG's pixels, as RGBA.
 *
 * The phone has no canvas to read a photo back from, so the Colour finder has the photo
 * shrunk and saved as a PNG on the phone (photo-pixels.ts) and reads it here. Only what that
 * produces needs reading — 8 bits a channel, not interlaced — but every colour type and every
 * row filter is handled, since which one an encoder picks is the encoder's business. Anything
 * else is refused out loud rather than read as the wrong colours.
 */
export function decodePng(bytes: Uint8Array): Pixels {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("Not a PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = -1;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let alphas: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const name = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (body.length !== length) throw new Error("A PNG cut short.");
    if (name === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8]!;
      type = body[9]!;
      interlace = body[12]!;
    } else if (name === "PLTE") {
      palette = body;
    } else if (name === "tRNS") {
      alphas = body;
    } else if (name === "IDAT") {
      idat.push(body);
    } else if (name === "IEND") {
      break;
    }
    at += 12 + length;
  }

  const channels = CHANNELS[type];
  if (!width || !height || channels === undefined) throw new Error("A PNG this reader doesn't know.");
  if (depth !== 8 || interlace !== 0) throw new Error("Only 8-bit, non-interlaced PNGs are read.");
  if (type === 3 && !palette) throw new Error("A palette PNG with no palette.");

  let size = 0;
  for (const part of idat) size += part.length;
  const zipped = new Uint8Array(size);
  let offset = 0;
  for (const part of idat) {
    zipped.set(part, offset);
    offset += part.length;
  }
  const raw = unzlibSync(zipped);
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error("A PNG cut short.");

  const rows = unfilter(raw, width, height, channels);
  return { width, height, data: toRgba(rows, width, height, type, palette, alphas) };
}

/** Undo each row's filter (PNG §9): what was stored is each byte's difference from a guess. */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = y * (stride + 1) + 1;
    const row = y * stride;
    const up = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp]! : 0;
      const b = y > 0 ? out[up + x]! : 0;
      const c = x >= bpp && y > 0 ? out[up + x - bpp]! : 0;
      let guess: number;
      switch (filter) {
        case 0:
          guess = 0;
          break;
        case 1:
          guess = a;
          break;
        case 2:
          guess = b;
          break;
        case 3:
          guess = (a + b) >> 1;
          break;
        case 4:
          guess = paeth(a, b, c);
          break;
        default:
          throw new Error("A PNG row with a filter this reader doesn't know.");
      }
      out[row + x] = (raw[line + x]! + guess) & 0xff;
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function toRgba(
  rows: Uint8Array,
  width: number,
  height: number,
  type: number,
  palette: Uint8Array | null,
  alphas: Uint8Array | null,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    switch (type) {
      case 6:
        out[o] = rows[i * 4]!;
        out[o + 1] = rows[i * 4 + 1]!;
        out[o + 2] = rows[i * 4 + 2]!;
        out[o + 3] = rows[i * 4 + 3]!;
        break;
      case 2:
        out[o] = rows[i * 3]!;
        out[o + 1] = rows[i * 3 + 1]!;
        out[o + 2] = rows[i * 3 + 2]!;
        out[o + 3] = 255;
        break;
      case 0:
        out[o] = out[o + 1] = out[o + 2] = rows[i]!;
        out[o + 3] = 255;
        break;
      case 4:
        out[o] = out[o + 1] = out[o + 2] = rows[i * 2]!;
        out[o + 3] = rows[i * 2 + 1]!;
        break;
      default: {
        const index = rows[i]!;
        out[o] = palette![index * 3] ?? 0;
        out[o + 1] = palette![index * 3 + 1] ?? 0;
        out[o + 2] = palette![index * 3 + 2] ?? 0;
        out[o + 3] = alphas?.[index] ?? 255;
      }
    }
  }
  return out;
}
