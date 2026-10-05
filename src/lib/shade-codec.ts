// Ported from HueVistaFrontEnd/src/lib/shade-codec.ts — keep the two in step.
import type { PaintShade } from "./shade-types";

/**
 * A compact wire format for the shade catalogue.
 *
 * WHY THIS EXISTS. Every page that opens the studio hands the whole catalogue to a
 * client component, and a client component's props travel inside the RSC payload
 * embedded in the HTML document. As JSON objects that is about 190 bytes a shade —
 * on a 12,000-shade catalogue, a 2.4 MB document before a single colour is drawn.
 *
 * On a laptop that is a second. On a phone it is the whole load: the bytes come down
 * a mobile connection, and then React has to walk 12,000 objects out of the flight
 * stream on a CPU a fraction as fast, on the main thread, before anything is
 * interactive. Measured on a mid-range phone profile, the studio took eight seconds
 * to reach its colour grid and far longer on a real handset.
 *
 * Two thirds of those bytes say nothing. Every shade repeats the same eight KEY names
 * ("code", "hvCode", "name", ...), and the fields that actually vary — company,
 * family, finishes — repeat a few dozen distinct values twelve thousand times over.
 *
 * So the catalogue crosses the wire as ONE string instead: the repeating values go in
 * dictionaries at the top and each shade becomes a line of eight fields. About 50
 * bytes a shade rather than 190, and the client's cost is a `split` and a loop rather
 * than twelve thousand objects deserialized by the React runtime.
 *
 * It is a TRANSPORT format and nothing else. Nothing is stored in it, nothing is
 * served from it, and it never crosses a version boundary: the same deployment writes
 * it and reads it, in one request. {@link decodeShades} still refuses a payload it
 * does not recognise (returning an empty catalogue rather than nonsense shades), which
 * is what makes it safe to roll out — a browser holding a stale bundle gets "no
 * colours loaded", never a catalogue of garbage.
 */

/** Format marker; bumped only if the field order below ever changes. */
const MAGIC = "hvshades1";

/** Row separator. Lines are cheap in JSON (`\n` is two characters) and `split` is fast. */
const ROW = "\n";
/** Field separator inside a row. */
const FIELD = "|";

/**
 * Escape the four characters that would otherwise be read as structure.
 *
 * Real shade names contain none of them, which is the point: the scan below is a
 * `indexOf`-style fast path in every engine, and the escape itself effectively never
 * fires. It is here so that a company which one day ships "Blue | Green" cannot
 * silently shift every field after it.
 */
function esc(value: string): string {
  if (!value) return "";
  // Cheap guard first — the overwhelming majority of values need no work at all.
  if (
    value.indexOf("\\") === -1 &&
    value.indexOf(FIELD) === -1 &&
    value.indexOf("\n") === -1 &&
    value.indexOf("\r") === -1
  ) {
    return value;
  }
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\p")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function unesc(value: string): string {
  if (value.indexOf("\\") === -1) return value;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[++i];
    out += next === "p" ? "|" : next === "n" ? "\n" : next === "r" ? "\r" : (next ?? "");
  }
  return out;
}

/**
 * A dictionary of the distinct values in a column, in first-seen order, plus the
 * index each value takes. Indices are written in base 36 — a catalogue has tens of
 * companies and hundreds of families, so one or two characters covers every real one.
 */
class Pool {
  private readonly index = new Map<string, number>();
  readonly values: string[] = [];

  put(value: string): string {
    let at = this.index.get(value);
    if (at === undefined) {
      at = this.values.length;
      this.values.push(value);
      this.index.set(value, at);
    }
    return at.toString(36);
  }

  encode(): string {
    return this.values.map(esc).join(FIELD);
  }
}

function readPool(line: string): string[] {
  // "".split("|") is [""], which would invent an empty entry for an empty pool.
  return line === "" ? [] : line.split(FIELD).map(unesc);
}

/**
 * Pack a catalogue for the wire. Safe on an empty list (the decoder round-trips it
 * back to an empty list), so callers never need to special-case "no shades".
 */
export function encodeShades(shades: ReadonlyArray<PaintShade>): string {
  const brands = new Pool();
  const families = new Pool();
  // Finish LISTS, not individual finishes: a catalogue holds a handful of distinct
  // combinations ("Matt, Satin", "Matt, Soft sheen", ...) and pooling the combination
  // spends one index where pooling the members would spend three.
  const finishes = new Pool();

  const rows = new Array<string>(shades.length);
  for (let i = 0; i < shades.length; i++) {
    const s = shades[i]!;
    rows[i] = [
      esc(s.code),
      esc(s.hvCode ?? ""),
      esc(s.name),
      // The "#" is on every single row and carries no information.
      s.hex.charAt(0) === "#" ? s.hex.slice(1) : s.hex,
      Number.isFinite(s.lrv) ? String(s.lrv) : "0",
      brands.put(s.brand ?? ""),
      families.put(s.family ?? ""),
      finishes.put((s.finishes ?? []).join(",")),
    ].join(FIELD);
  }

  // Header first, then the rows — the pools have to be complete before they are
  // written, which is why this is assembled after the loop rather than during it.
  return [MAGIC, brands.encode(), families.encode(), finishes.encode(), ...rows].join(ROW);
}

/**
 * Unpack what {@link encodeShades} wrote.
 *
 * Returns an empty catalogue for anything it does not recognise. That is the whole
 * safety story of this format: an empty catalogue is a state the studio already
 * handles and already explains ("no colours loaded"), whereas a half-parsed one would
 * put invented codes on a wall and print them on a colour board.
 */
export function decodeShades(packed: string | null | undefined): PaintShade[] {
  if (!packed) return [];
  const lines = packed.split(ROW);
  if (lines.length < 4 || lines[0] !== MAGIC) return [];

  const brands = readPool(lines[1]!);
  const families = readPool(lines[2]!);
  const finishSets = readPool(lines[3]!).map((f) => (f === "" ? [] : f.split(",")));

  const out: PaintShade[] = [];
  for (let i = 4; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "") continue;
    const f = line.split(FIELD);
    if (f.length < 8) continue;
    const lrv = Number(f[4]);
    out.push({
      code: unesc(f[0]!),
      hvCode: f[1] === "" ? null : unesc(f[1]!),
      name: unesc(f[2]!),
      hex: `#${f[3]!}`,
      family: families[parseInt(f[6]!, 36)] ?? "",
      lrv: Number.isFinite(lrv) ? lrv : 0,
      brand: brands[parseInt(f[5]!, 36)] ?? "",
      finishes: finishSets[parseInt(f[7]!, 36)] ?? [],
    });
  }
  return out;
}
