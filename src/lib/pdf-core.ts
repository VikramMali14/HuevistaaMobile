/**
 * Ported from HueVistaFrontEnd/src/lib/pdf-core.ts — keep the two in step. One change:
 * `serialize` returns the file's bytes rather than a browser Blob (a phone writes them
 * with expo-file-system).
 */
/**
 * The dependency-free PDF plumbing shared by every generator in the app.
 *
 * It was all inside `pdf-export` (the colour board) until the reports console
 * needed to print a table. The two documents have nothing in common above this
 * line — one is photographs, the other is a spreadsheet — but below it they are
 * the same handful of things: Latin-1 bytes, WinAnsi-escaped literals, the
 * base-14 Helvetica metrics, and the object/xref plumbing of a PDF file. Those
 * belong in one place, not least because the font width tables are eighty lines
 * of magic numbers that must not be typed twice.
 *
 * Everything here is browser-safe and synchronous; no font is embedded, so a
 * document is a few hundred bytes of plumbing plus its own content.
 */

/** Latin-1 encode a JS string into bytes (PDF content is byte-oriented). */
export function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Escape a string for a PDF literal ( … ). Typographic punctuation maps onto
 * its real WinAnsi byte (octal escape); anything else WinAnsi can't show
 * becomes "?".
 */
export function pdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += ch; // ASCII
    else if (code >= 0xa0 && code <= 0xff) out += ch; // Latin-1 upper (WinAnsi)
    else if (code === 0x2018) out += "\\221"; // ' left single quote
    else if (code === 0x2019) out += "\\222"; // ' right single quote
    else if (code === 0x201c) out += "\\223"; // " left double quote
    else if (code === 0x201d) out += "\\224"; // " right double quote
    else if (code === 0x2013) out += "\\226"; // – en dash
    else if (code === 0x2014) out += "\\227"; // — em dash
    else if (code === 0x2022) out += "\\225"; // • bullet
    else if (code === 0x2026) out += "\\205"; // … ellipsis
    else out += "?";
  }
  return out;
}

/** Whether every character of `s` prints as itself in the base-14 fonts (none turns into "?"). */
export function pdfPrintable(s: string): boolean {
  return !pdfText(s.replace(/\?/g, "")).includes("?");
}

/** Compact number formatting for the content stream. */
export function num(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [
    Number.isFinite(r) ? r / 255 : 0,
    Number.isFinite(g) ? g / 255 : 0,
    Number.isFinite(b) ? b / 255 : 0,
  ];
}

/**
 * Helvetica / Helvetica-Bold advance widths for ASCII 0x20–0x7E, in 1/1000 em,
 * straight from the Adobe AFM metrics for the built-in base-14 fonts. They let
 * us right-align and ellipsis-truncate text without embedding a font.
 */
// prettier-ignore
const W_HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
// prettier-ignore
const W_HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Width of `s` set in Helvetica (`bold` for Helvetica-Bold) at `size` pt. */
export function textWidth(s: string, size: number, bold = false): number {
  const table = bold ? W_HELV_BOLD : W_HELV;
  let units = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) units += table[c - 0x20]!;
    else if (c === 0x2026) units += 1000; // ellipsis
    else units += 556; // fair average for the Latin-1 upper range
  }
  return (units / 1000) * size;
}

/** Truncate `s` with an ellipsis so it sets no wider than `maxWidth` pt. */
export function fitText(s: string, size: number, maxWidth: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxWidth) return s;
  let out = s;
  while (out.length > 0 && textWidth(out.trimEnd() + "…", size, bold) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.trimEnd() + "…";
}

/** One text run: fill colour, face, size, position, string. `tracking` = letterspacing (Tc). */
export function textOp(
  font: "F1" | "F2",
  size: number,
  x: number,
  y: number,
  s: string,
  color: string,
  tracking = 0,
): string {
  const tc = tracking ? ` ${num(tracking)} Tc` : "";
  const reset = tracking ? " 0 Tc" : "";
  return `${color} rg BT /${font} ${num(size)} Tf${tc} ${num(x)} ${num(y)} Td (${pdfText(s)}) Tj${reset} ET`;
}

/** A horizontal hairline from x1 to x2 at height y. */
export function hline(y: number, x1: number, x2: number, color: string, w = 0.6): string {
  return `${color} RG ${num(w)} w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`;
}

/** A filled rectangle — table header bands, zebra rows, swatches. */
export function fillRect(x: number, y: number, w: number, h: number, color: string): string {
  return `${color} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`;
}

/**
 * The shape `qrcode`'s BitMatrix already has, named structurally so this module
 * never has to import that library — not even for a type. The QR is computed by
 * whoever is calling (the library is loaded on demand, and this file is loaded by
 * every generator in the app); all that arrives here is a grid.
 */
export interface QrModules {
  readonly size: number;
  get(row: number, col: number): boolean | number;
}

/**
 * A QR code drawn as VECTOR rectangles, fitted into a `size`-point square whose
 * bottom-left corner is (x, y).
 *
 * <h2>Why not an image</h2>
 * Every other picture in these documents is a JPEG, and a JPEG is exactly the wrong
 * container for this one. DCTDecode is lossy and chroma-subsampled: it rings around
 * hard black-on-white edges, which is the only kind of edge a QR has. The artefacts
 * are invisible at a glance and cost real scans off a creased sheet under a shop's
 * lighting — the situation this code is printed for. Filled rectangles have no such
 * failure mode, stay sharp at any print size, and a typical symbol costs a couple of
 * kilobytes of content stream, which is less than the JPEG would have.
 *
 * <h2>Runs, not squares</h2>
 * Horizontally adjacent dark modules are merged into one rectangle before being
 * emitted, and the whole symbol is a single path with one fill at the end rather than
 * a fill per module. A 33×33 symbol is around 250 rectangles that way instead of
 * roughly 550 individually-filled ones.
 *
 * <h2>The quiet zone is part of the code</h2>
 * The four-module margin the spec requires is included INSIDE `size`, and painted
 * white rather than merely left alone: a scanner needs the border, and "nothing is
 * drawn there" stops being true the moment somebody puts this over a rule, a band or
 * a photograph. Getting this wrong is the single most common reason a printed QR
 * refuses to scan.
 */
export function qrOps(
  modules: QrModules,
  x: number,
  y: number,
  size: number,
  color = "0 0 0",
): string {
  const QUIET = 4;
  const count = modules.size;
  if (count <= 0) return "";
  const scale = size / (count + QUIET * 2);

  // White backing for the whole square, quiet zone included — see the note above.
  const ops: string[] = [fillRect(x, y, size, size, "1 1 1"), `${color} rg`];

  const originX = x + QUIET * scale;
  // PDF's y axis points up and a QR's rows run down, so row 0 sits at the TOP of the
  // module area and each subsequent row steps down by one module.
  const moduleTop = y + size - QUIET * scale;

  for (let row = 0; row < count; row++) {
    const rowBottom = moduleTop - (row + 1) * scale;
    let runStart = -1;
    // One past the end so a run reaching the right edge is still closed.
    for (let col = 0; col <= count; col++) {
      const dark = col < count && Boolean(modules.get(row, col));
      if (dark && runStart < 0) runStart = col;
      if (!dark && runStart >= 0) {
        ops.push(
          `${num(originX + runStart * scale)} ${num(rowBottom)} ` +
            `${num((col - runStart) * scale)} ${num(scale)} re`,
        );
        runStart = -1;
      }
    }
  }
  ops.push("f");
  return ops.join("\n");
}

/**
 * Collects numbered objects and serialises them into a file.
 *
 * PDF cross-references are byte offsets, so an object's position is only known
 * once everything before it has been written — which is why bodies are
 * collected first and the xref built during the final pass. `patch` exists for
 * the one object that cannot be written in order: /Pages has to list its kids,
 * and the kids are pages that must be created after it.
 */
export class PdfDoc {
  private objects: (Uint8Array | string)[][] = [];

  /** Adds an object and returns its 1-based object number. */
  add(parts: (Uint8Array | string)[]): number {
    this.objects.push(parts);
    return this.objects.length;
  }

  /** Replaces the body of an object added earlier (reserved with `add([""])`). */
  patch(id: number, parts: (Uint8Array | string)[]): void {
    this.objects[id - 1] = parts;
  }

  /** Header, objects, xref table, trailer — a complete PDF 1.4 file, as bytes. */
  serialize(catalogId: number): Uint8Array {
    const chunks: Uint8Array[] = [];
    let length = 0;
    const push = (part: Uint8Array | string) => {
      const bytes = typeof part === "string" ? latin1(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    };

    push("%PDF-1.4\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment

    const offsets: number[] = new Array(this.objects.length).fill(0);
    this.objects.forEach((parts, idx) => {
      offsets[idx] = length;
      push(`${idx + 1} 0 obj\n`);
      for (const p of parts) push(p);
      push("\nendobj\n");
    });

    const xrefOffset = length;
    const count = this.objects.length + 1; // +1 for the free object 0
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
    push(xref);
    push(`trailer\n<< /Size ${count} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}
