/**
 * Ported from HueVistaFrontEnd/src/lib/pdf-export.ts — keep the two in step, so a board
 * made on a phone is the same sheet as one made on the website. What changed:
 *
 * - Pictures arrive as JPEG BYTES (a GL snapshot read from the phone's cache), not data
 *   URLs, and the file comes back as bytes (see pdf-core).
 * - A page whose picture could not be taken — a phone with no live colour, a snapshot
 *   that failed — prints its colours as a panel of swatches in the photo's place rather
 *   than being dropped. Every option on the sheet is one the server records, so a page
 *   can never be missing from the file.
 * - The painter app's address comes from `env`.
 *
 * Tiny, dependency-free PDF builder for the "Add to PDF" colour board.
 *
 * The studio lets the user snapshot the recoloured canvas (up to the plan's
 * per-board cap) and download them as a single multi-page PDF. A project hands
 * over ONE board and is then finished, so this file is the whole deliverable —
 * which is why the project's latest AI image goes on the end of it (see
 * `aiImage`) rather than living only on a screen the customer has to come back
 * to. Each page is a branded A4 sheet:
 * a palette strip of the option's colours across the top edge, a header with
 * the project title / option counter / date, the painted photo hairline-framed
 * in the middle, and a table of the shades used — paint chip, region, shade
 * name, shade number and hex — anchored above a footer with page numbers.
 *
 * Why hand-rolled instead of a library: the whole board is a handful of images
 * plus text, so a full PDF dependency (jsPDF et al.) would dwarf the feature. A
 * JPEG can be embedded straight into a PDF as a DCTDecode image XObject with no
 * re-encoding, and text needs only the built-in Helvetica faces — so the entire
 * generator is a few hundred bytes of object plumbing. Everything runs in the
 * browser (uses atob), which is where the canvas snapshots live.
 */

// The byte-level plumbing (Latin-1 encoding, WinAnsi escaping, the base-14
// Helvetica metrics, the object/xref writer) is shared with the reports
// console's table PDF — see pdf-core for why it no longer lives here.
import { tEn } from "@/i18n";

import { fitText, hexToRgb, hline, latin1, num, PdfDoc, pdfText, qrOps, textOp, textWidth } from "./pdf-core";
import type { QrModules } from "./pdf-core";
import { env } from "@/config/env";

/** One shade shown under a snapshot: a colour preview plus its name/code. */
export interface PdfShade {
  /** Region this colour was applied to, e.g. "Main wall" / "Accent wall" / "Border". */
  label: string;
  /**
   * Which region that was. Never printed — it exists so the board can be REPORTED
   * accurately once it has been built: the closing flow re-renders each combination
   * from the project's masks, and a label alone cannot say which mask to paint.
   */
  regionId?: number;
  /**
   * The catalogue code as the catalogue has it, before the shop's own display scheme
   * encodes or hides it. Also never printed — `code` is what goes on the page. The two
   * differ deliberately: a shop that obfuscates its codes still needs the real one
   * recorded, or its customer's own colour board could not be read back afterwards.
   */
  rawCode?: string;
  /** Catalogue shade name, or a generic label for an exact custom colour. */
  name: string;
  /** Shade code / number, when known (hidden for guests / custom colours). */
  code?: string;
  /** Colour preview, as #rrggbb. */
  hex: string;
}

/** One snapshot added to the board: the painted photo + the shades it used. */
export interface PdfImageEntry {
  /** A baseline JPEG of the recoloured room; null prints the colours as swatches. */
  jpeg: Uint8Array | null;
  shades: PdfShade[];
}

/**
 * The project's latest AI image, printed as the board's closing page.
 *
 * It is a separate type rather than one more {@link PdfImageEntry} because it is not
 * an option to choose between — the choosing already happened, and this is the one
 * combination the customer had photographed for real. It is numbered apart from the
 * options for the same reason ("AI image", not "Option 6 of 5"), and it is never
 * counted against the per-board picture cap: the cap exists to bound how many canvas
 * snapshots a phone has to hold in memory at once, and this is a single already-encoded
 * image the browser downloaded rather than rendered.
 */
export interface PdfAiImage {
  /** The finished render, as JPEG bytes. */
  jpeg: Uint8Array;
  /** The combination it was made from, so the sheet still names the shades. */
  shades: PdfShade[];
  /** How it was photographed — e.g. "Modern · Day · Natural light". */
  caption?: string;
}

/**
 * The reward QR that closes a finished board, and the people it is for.
 *
 * <p>The shop that sold the job and the painter who did it each scan this once for their
 * points; the customer scans it to review the job on the Community page. It gets a
 * page of its own rather than a corner of the last picture page for a practical reason:
 * the board changes hands at a counter, and somebody has to FIND the thing. A full page
 * with one big symbol and one line of instruction is found; a stamp in a footer, under a
 * shade table, is not — and a QR too small to survive a phone camera at arm's length under
 * shop lighting is a QR that does not work at all.
 *
 * <p>The modules arrive already computed. `qrcode` is loaded on demand by the caller, so
 * neither this module nor `pdf-core` carries it, and this generator stays synchronous.
 */
export interface PdfRewardQr {
  /** The computed symbol — `qrcode`'s BitMatrix satisfies this structurally. */
  modules: QrModules;
  /** The URL it encodes, printed underneath for anyone whose camera will not read it. */
  url: string;
  /** Last day it can be scanned, already formatted. Omitted when there is no deadline. */
  expiresOn?: string;
  /**
   * False when the code pays no points — a room the customer did not buy — so the page
   * speaks to the customer alone rather than telling a shop and a painter to scan a code
   * that will refuse them. Omitted means it pays.
   */
  paysPoints?: boolean;
}

/** A4 portrait, in PostScript points (1/72"). */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;

/* Page furniture metrics (all in points, measured from the page bottom). */
const STRIP_H = 10; // full-bleed palette strip along the top edge
const ROW_H = 26; // one shade-table row
const TABLE_BOTTOM = 64; // bottom of the shade table, above the footer
const FOOT_RULE_Y = 46;
const FOOT_BASE = 33;

/* Brand palette (matches globals.css light theme), as PDF "r g b" strings. */
const INK = "0.1 0.09 0.16"; // #1a1828
const MUTE = "0.42 0.41 0.49"; // #6b687e
const ACCENT = "0.753 0.545 0.306"; // #c08b4e
/** The same accent as a hex, for the one caller that paints a strip rather than text. */
const ACCENT_HEX = "#c08b4e";
const RULE_SOFT = "0.89 0.88 0.93";
const RULE_STRONG = "0.81 0.8 0.86";

/**
 * Read a baseline JPEG's pixel dimensions from its SOF marker. Canvas JPEG
 * output is always a baseline, 3-component (YCbCr → DeviceRGB) stream, so this
 * simple marker scan is enough. Returns {0,0} if no SOF is found.
 */
function jpegSize(bytes: Uint8Array): { w: number; h: number } {
  let i = 2; // skip SOI (FF D8)
  const n = bytes.length;
  while (i + 1 < n) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    let marker = bytes[i + 1]!;
    // Collapse any run of 0xFF fill bytes onto the real marker.
    while (marker === 0xff && i + 2 < n) {
      i++;
      marker = bytes[i + 1]!;
    }
    i += 2;
    // Standalone markers (no length): SOI, EOI, RSTn, TEM.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    if (i + 1 >= n) break;
    const segLen = (bytes[i]! << 8) | bytes[i + 1]!;
    // SOF0..SOF15 carry the frame size, except DHT(C4), JPG(C8) and DAC(CC).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && i + 6 < n) {
      const h = (bytes[i + 3]! << 8) | bytes[i + 4]!;
      const w = (bytes[i + 5]! << 8) | bytes[i + 6]!;
      return { w, h };
    }
    i += segLen;
  }
  return { w: 0, h: 0 };
}

/** January … December, as printed. */
const months = () => tEn("pdf.months").split(",");

/**
 * "Generated 31 Jul 2026, 4:15 pm" — the moment this file was built.
 *
 * The time matters as much as the date: a counter often prints two boards for the same
 * customer on the same day as they change their mind, and the date alone cannot tell you
 * which sheet on the table is the later one.
 */
function formatDateLine(d: Date): string {
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const meridiem = h24 < 12 ? "am" : "pm";
  return tEn("pdf.generated", {
    date: `${d.getDate()} ${months()[d.getMonth()] ?? ""} ${d.getFullYear()}`,
    time: `${h12}:${minutes} ${meridiem}`,
  });
}

/** Branded header (palette strip, eyebrow, date, title) + footer, shared by every page. */
function pageChrome(
  stripHexes: string[],
  title: string,
  dateLine: string,
  pageNo: number,
  pageCount: number,
  universalCodes: boolean,
  counter?: string,
  /** The small tracked-out line above the title. "COLOUR BOARD" on a board; a
   *  one-page sheet of a single AI image says what it actually is instead. */
  eyebrow: string = tEn("pdf.eyebrowBoard"),
  /** The line above the footer. An AI image's page says it was made by AI as well. */
  disclaimer: string = tEn("pdf.disclaimer"),
): string[] {
  const ops: string[] = [];
  const right = PAGE_W - MARGIN;

  // Full-bleed palette strip along the top edge — this option's colours.
  const seg = PAGE_W / stripHexes.length;
  stripHexes.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    ops.push(`${num(r)} ${num(g)} ${num(b)} rg`);
    // +0.5 overlap hides hairline gaps between antialiased segment edges.
    ops.push(`${num(i * seg)} ${num(PAGE_H - STRIP_H)} ${num(seg + 0.5)} ${num(STRIP_H)} re f`);
  });

  // Eyebrow + date line.
  const eyebrowY = PAGE_H - 58;
  ops.push(textOp("F2", 8, MARGIN, eyebrowY, eyebrow, ACCENT, 1.5));
  ops.push(textOp("F1", 8.5, right - textWidth(dateLine, 8.5), eyebrowY, dateLine, MUTE));

  // Project title, with the option counter on the right.
  const titleY = PAGE_H - 84;
  const counterW = counter ? textWidth(counter, 10) : 0;
  ops.push(
    textOp("F2", 19, MARGIN, titleY, fitText(title, 19, right - MARGIN - counterW - 24, true), INK),
  );
  if (counter) ops.push(textOp("F1", 10, right - counterW, titleY, counter, MUTE));
  ops.push(hline(PAGE_H - 100, MARGIN, right, RULE_STRONG, 1));

  // Indicative-colour disclaimer, centred just above the footer rule. Screens,
  // print and real paint never match exactly, so the board is a guide, not a
  // colour proof — say so on every page.
  ops.push(
    textOp("F1", 7.5, (PAGE_W - textWidth(disclaimer, 7.5)) / 2, FOOT_RULE_Y + 7, disclaimer, MUTE),
  );

  // Footer. The left slot says WHERE the codes above can be read, which is the one
  // thing this sheet cannot do for itself: the codes name no paint company and no
  // shade on purpose, so a printed board is only useful if the person holding it
  // knows who can turn them back into a tin. Which answer is true depends on the
  // issuing shop — a shop running its own pattern is the only place its codes mean
  // anything, while an HV code works at any HueVistaa counter — and printing the
  // wrong one sends a customer on a wasted trip. On every page, because pages get
  // separated from each other.
  ops.push(hline(FOOT_RULE_Y, MARGIN, right, RULE_SOFT));
  ops.push(textOp("F1", 8, MARGIN, FOOT_BASE,
    universalCodes ? tEn("pdf.footerUniversal") : tEn("pdf.footerShop"), MUTE));
  const pg = tEn("pdf.page", { n: pageNo, total: pageCount });
  ops.push(textOp("F1", 8, right - textWidth(pg, 8), FOOT_BASE, pg, MUTE));

  return ops;
}

/**
 * Build the content-stream drawing ops for one picture page.
 *
 * Shared by the option pages and the closing AI-image page: the layout is identical
 * and only the wording differs, which is the point — a customer flicking through the
 * sheet should read one document, not an appendix bolted on.
 */
function pageContent(
  entry: PdfImageEntry,
  imgW: number,
  imgH: number,
  title: string,
  dateLine: string,
  universalCodes: boolean,
  pageNo: number,
  pageCount: number,
  /** Right-hand slot beside the title, e.g. "Option 2 of 5" or "Your AI image". */
  counter: string,
  /** Heading over the shade table, e.g. "COLOURS IN THIS OPTION". */
  sectionLabel: string,
  /** Optional right-aligned note beside that heading — how the image was made. */
  sectionNote?: string,
  eyebrow?: string,
  disclaimer?: string,
): string {
  const right = PAGE_W - MARGIN;
  const stripHexes = entry.shades.length ? entry.shades.map((s) => s.hex) : ["#c08b4e"];
  const ops = pageChrome(stripHexes, title, dateLine, pageNo, pageCount, universalCodes,
    counter, eyebrow, disclaimer);

  // Shade table, anchored to the bottom so every page shares one layout.
  const rows = Math.max(1, entry.shades.length);
  const tableTop = TABLE_BOTTOM + rows * ROW_H;
  ops.push(textOp("F2", 8, MARGIN, tableTop + 14, sectionLabel, MUTE, 1.5));
  if (sectionNote) {
    const fitted = fitText(sectionNote, 8, (right - MARGIN) / 2);
    ops.push(textOp("F1", 8, right - textWidth(fitted, 8), tableTop + 14, fitted, MUTE));
  }
  ops.push(hline(tableTop + 6, MARGIN, right, RULE_STRONG, 1));

  entry.shades.forEach((shade, j) => {
    const rowTop = TABLE_BOTTOM + (rows - j) * ROW_H;
    const base = rowTop - 16.5; // text baseline within the row
    const [r, g, b] = hexToRgb(shade.hex);
    // Paint chip, with a hairline border so pale colours read on white paper.
    ops.push(`${num(r)} ${num(g)} ${num(b)} rg ${num(MARGIN)} ${num(rowTop - 21)} 34 16 re f`);
    ops.push(`0.73 0.71 0.79 RG 0.6 w ${num(MARGIN)} ${num(rowTop - 21)} 34 16 re S`);
    // Columns: region · shade name · shade number (right side). No hex — the
    // chip shows the colour; codes are what the counter works from.
    ops.push(textOp("F2", 9.5, MARGIN + 46, base, fitText(shade.label, 9.5, 128, true), INK));
    ops.push(textOp("F1", 10, MARGIN + 182, base, fitText(shade.name, 10, 148), INK));
    if (shade.code) {
      ops.push(textOp("F1", 9.5, MARGIN + 338, base, fitText(tEn("pdf.shadeNo", { code: shade.code }), 9.5, 170), MUTE));
    }
    ops.push(hline(rowTop - ROW_H, MARGIN, right, RULE_SOFT));
  });

  // Photo: centred in the space between the header and the table, hairline-framed.
  const areaTop = PAGE_H - 118;
  const areaBottom = tableTop + 36;
  const availW = right - MARGIN;
  const availH = areaTop - areaBottom;
  let dispW = availW;
  let dispH = availH;
  if (imgW > 0 && imgH > 0) {
    const scale = Math.min(availW / imgW, availH / imgH);
    dispW = imgW * scale;
    dispH = imgH * scale;
  }
  if (imgW <= 0 || imgH <= 0) {
    // No picture of the room: its colours, side by side, at the photo's usual 4:3.
    dispH = Math.min(availH, availW * 0.75);
    const panelY = areaBottom + (availH - dispH) / 2;
    const hexes = entry.shades.length ? entry.shades.map((s) => s.hex) : [ACCENT_HEX];
    const band = availW / hexes.length;
    hexes.forEach((hex, i) => {
      const [r, g, b] = hexToRgb(hex);
      ops.push(`${num(r)} ${num(g)} ${num(b)} rg ${num(MARGIN + i * band)} ${num(panelY)} ${num(band + 0.5)} ${num(dispH)} re f`);
    });
    ops.push(`${RULE_STRONG} RG 1 w ${num(MARGIN)} ${num(panelY)} ${num(availW)} ${num(dispH)} re S`);
    return ops.join("\n");
  }
  const imgX = (PAGE_W - dispW) / 2;
  const imgY = areaBottom + (availH - dispH) / 2;
  ops.push(`q ${num(dispW)} 0 0 ${num(dispH)} ${num(imgX)} ${num(imgY)} cm /Im0 Do Q`);
  ops.push(`${RULE_STRONG} RG 1 w ${num(imgX)} ${num(imgY)} ${num(dispW)} ${num(dispH)} re S`);

  return ops.join("\n");
}

/**
 * The board's closing page: one big QR, and the three people who scan it — the shop and
 * the painter for their points, and the customer to say how the room turned out.
 *
 * <h2>Why it says so little</h2>
 * Everything on this page is read by somebody standing at a counter with a customer
 * waiting — so it carries one instruction per reader and nothing else. The sentence that
 * matters most is the one about scanning once: without it, a shop that scans and sees
 * nothing happen scans again, and the refusal it gets reads as a bug rather than as the
 * rule working.
 *
 * <h2>The URL is printed as well</h2>
 * Not decoration. Camera apps fail — a cracked lens, a locked-down work phone, a camera
 * that will not read QR at all — and without the address underneath, a board whose symbol
 * cannot be read is a dead end. It is also what makes the page checkable by a human: an
 * address on a HueVistaa domain is something a shopkeeper can recognise before trusting it.
 */
function rewardPageContent(
  reward: PdfRewardQr,
  title: string,
  dateLine: string,
  pageNo: number,
  universalCodes: boolean,
): string[] {
  const ops = pageChrome([ACCENT_HEX], title, dateLine, pageNo, pageNo, universalCodes,
    undefined, tEn("pdf.eyebrowReward"));
  const centred = (text: string, size: number, y: number, color: string, bold = false) =>
    ops.push(textOp(bold ? "F2" : "F1", size, (PAGE_W - textWidth(text, size, bold)) / 2, y,
      text, color));

  centred(tEn("pdf.rewardTitle"), 17, 690, INK, true);
  const paysPoints = reward.paysPoints !== false;
  centred(paysPoints ? tEn("pdf.rewardLead") : tEn("pdf.rewardLeadPlain"), 9.5, 670, MUTE);

  // 200pt — a shade under three inches. Sized for a phone held at arm's length over a
  // counter, not for a page that looks tidy: a symbol that has to be leaned into is one
  // that gets given up on.
  const QR_SIZE = 200;
  ops.push(qrOps(reward.modules, (PAGE_W - QR_SIZE) / 2, 420, QR_SIZE));

  // A room the customer did not buy pays nobody, so its page names only the customer —
  // telling a shop or painter to scan it would send them to a refusal.
  if (paysPoints) {
    centred(tEn("pdf.shopHead"), 8, 390, ACCENT, true);
    centred(tEn("pdf.shopLine"), 10, 375, INK);
    centred(tEn("pdf.painterHead"), 8, 352, ACCENT, true);
    // Named, because a painter's points live in their own app: a phone camera opens this
    // code on the main site, which hands a painter across, but saying where up front
    // saves the detour — and tells a painter new to HueVistaa where to sign up.
    centred(tEn("pdf.painterLine", { site: env.painterOrigin.replace(/^https?:\/\//, "") }), 10, 337, INK);
  }
  // The customer's line. A review can only be left from here, by the account the room
  // was made for — which is what makes every review on the Community page a real job.
  centred(tEn("pdf.customerHead"), 8, 314, ACCENT, true);
  centred(tEn("pdf.customerLine"), 10, 299, INK);

  ops.push(hline(278, MARGIN + 90, PAGE_W - MARGIN - 90, RULE_SOFT));

  if (paysPoints) {
    centred(tEn("pdf.onceLine1"), 8.5, 260, MUTE);
    centred(tEn("pdf.onceLine2"), 8.5, 248, MUTE);
  }

  centred(readableUrl(reward.url), 8.5, 222, INK);
  if (reward.expiresOn && paysPoints) {
    centred(tEn("pdf.claimUntil", { date: reward.expiresOn }), 8, 206, MUTE);
  }

  return ops;
}

/**
 * Where the reward page is tappable: the QR symbol and the printed address.
 *
 * The customer is the one person who cannot SCAN this code — the board is usually the PDF
 * on their own phone, and a phone cannot photograph its own screen. A link annotation lets
 * them tap it instead. Kept beside {@link rewardPageContent} because the rectangles must
 * match where that function draws; the numbers are the same numbers.
 */
function rewardLinkRects(reward: PdfRewardQr): [number, number, number, number][] {
  const QR_SIZE = 200;
  const qrX = (PAGE_W - QR_SIZE) / 2;
  const address = readableUrl(reward.url);
  const w = textWidth(address, 8.5);
  const x = (PAGE_W - w) / 2;
  return [
    [qrX, 420, qrX + QR_SIZE, 420 + QR_SIZE],
    [x - 6, 216, x + w + 6, 234],
  ];
}

/** The link annotations for {@link rewardLinkRects}, as PDF dictionaries. */
function rewardLinkAnnots(reward: PdfRewardQr): string[] {
  return rewardLinkRects(reward).map(([x1, y1, x2, y2]) =>
    `<< /Type /Annot /Subtype /Link /Rect [${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)}] ` +
    `/Border [0 0 0] /A << /S /URI /URI (${pdfText(reward.url)}) >> >>`);
}

/** The URL as it reads on paper — a scheme adds nothing for somebody typing it in. */
function readableUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Assemble the entries into a single PDF and return its bytes. Each entry is
 * one branded A4 page (palette strip, header, framed photo, shade table, footer).
 * An entry with no readable JPEG prints its swatches in the photo's place; an empty
 * list yields a one-line notice page.
 */
export function buildColourBoardPdf(
  entries: PdfImageEntry[],
  title = "HueVistaa",
  /**
   * Whether the codes on this board can be read at ANY HueVistaa shop (an HV code) or
   * only back at the shop that issued them (that shop's own pattern). Decides one line
   * in the footer, and getting it wrong sends someone to a counter that cannot help.
   *
   * Defaults to true because that is the state of every shop that has not opted into a
   * pattern of its own, which is most of them; the studio passes the real answer.
   */
  universalCodes = true,
  /**
   * The project's latest AI image, appended as the closing page. Omitted when the
   * project has not had one made yet — which is the ordinary case at the counter, since
   * the board is usually downloaded before the picture is ordered. An unreadable one is
   * dropped like any other page rather than failing the board.
   */
  aiImage?: PdfAiImage | null,
  /**
   * The eyebrow printed on every page. Defaults to the board's own.
   *
   * Only {@link buildAiImagePdf} passes anything else: a one-page sheet carrying a single
   * picture is not a colour board, and a header claiming it is would be the one line on
   * the page that is untrue.
   */
  eyebrow?: string,
  /**
   * The reward QR, given a page of its own at the end of the board.
   *
   * <p>Optional, and absent is the normal state for anything that is not a customer's
   * finished board — the AI-image sheet below passes nothing, and a board built by a studio
   * that could not reach the server for a code prints without one rather than failing. A
   * missing page is a board; a thrown exception is no board at all, and this is the last
   * thing somebody gets at a counter.
   */
  reward?: PdfRewardQr | null,
): Uint8Array {
  // Object bodies are collected first; the writer fills in the byte offsets on
  // its final pass (see PdfDoc).
  const doc = new PdfDoc();
  const addObject = (parts: (Uint8Array | string)[]): number => doc.add(parts);

  const catalogId = addObject(["<< /Type /Catalog /Pages 2 0 R >>"]);
  const pagesId = addObject([""]); // body patched in once kids are known
  const fontId = addObject([
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ]);
  const boldFontId = addObject([
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ]);
  const fontRes = `/Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>`;

  const dateLine = formatDateLine(new Date());
  // Every option is printed: one whose picture is missing or unreadable gets swatches.
  const usable = entries.map((e) => ({ entry: e, bytes: readableJpeg(e.jpeg) }));

  // The AI image only earns its page if its bytes actually decoded. A board that lost
  // its closing page is a smaller board; a board that threw on the way to being built
  // is no board at all, and this is the last thing the customer gets.
  const aiBytes = aiImage ? readableJpeg(aiImage.jpeg) : null;
  const closing = aiImage && aiBytes ? { entry: aiImage, bytes: aiBytes } : null;
  // Numbered across the whole document, closing page included, so "Page 6 of 6" is
  // true. The OPTION counter deliberately is not — see the counter argument below.
  //
  // The `|| 1` rather than a Math.max around the options is what lets the AI image stand
  // on its own. A board with no options is a document with nothing in it and earns the
  // apology page below; a board that is ONLY the closing image is the single-image sheet,
  // and padding it to two pages would print that apology opposite a perfectly good
  // picture. So the floor of one applies to the empty case alone.
  // The reward page is counted too, so "Page 7 of 7" stays true. It is added OUTSIDE the
  // `|| 1` floor deliberately: that floor exists to give an empty board its apology page,
  // and a board with nothing on it but a QR is still an empty board that needs one.
  const pageCount = ((usable.length + (closing ? 1 : 0)) || 1) + (reward ? 1 : 0);

  const kids: number[] = [];

  /**
   * One picture page: the image XObject, its content stream, and the page itself. With no
   * readable picture there is no XObject, and the page draws its swatches instead.
   */
  const addPicturePage = (
    entry: PdfImageEntry | PdfAiImage,
    bytes: Uint8Array | null,
    pageNo: number,
    counter: string,
    sectionLabel: string,
    sectionNote?: string,
    disclaimer?: string,
  ) => {
    const { w, h } = bytes ? jpegSize(bytes) : { w: 0, h: 0 };
    const imageId = bytes
      ? addObject([
          `<< /Type /XObject /Subtype /Image /Width ${w || 1} /Height ${h || 1} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
          bytes,
          "\nendstream",
        ])
      : null;
    const content = pageContent({ jpeg: bytes, shades: entry.shades }, w, h, title, dateLine, universalCodes,
      pageNo, pageCount, counter, sectionLabel, sectionNote, eyebrow, disclaimer);
    const contentBytes = latin1(content);
    const contentId = addObject([
      `<< /Length ${contentBytes.length} >>\nstream\n`,
      content,
      "\nendstream",
    ]);
    const xobject = imageId ? ` /XObject << /Im0 ${imageId} 0 R >>` : "";
    kids.push(addObject([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
        `/Resources << ${fontRes}${xobject} >> ` +
        `/Contents ${contentId} 0 R >>`,
    ]));
  };

  if (usable.length === 0 && !closing) {
    // Degenerate case: a branded page telling the user there was nothing to add.
    const ops = pageChrome(["#c08b4e"], title, dateLine, 1, pageCount, universalCodes,
      undefined, eyebrow);
    ops.push(textOp("F1", 12, MARGIN, PAGE_H - 160, tEn("pdf.noImages"), MUTE));
    const content = ops.join("\n");
    const contentId = addObject([`<< /Length ${latin1(content).length} >>\nstream\n`, content, "\nendstream"]);
    const pageId = addObject([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
        `/Resources << ${fontRes} >> /Contents ${contentId} 0 R >>`,
    ]);
    kids.push(pageId);
  } else {
    // The option counter counts OPTIONS, not pages — "Option 5 of 5" stays true on a
    // board whose sixth page is the AI image, because the customer was never asked to
    // choose between six things.
    usable.forEach(({ entry, bytes }, i) => {
      addPicturePage(entry, bytes, i + 1, tEn("pdf.optionOf", { n: i + 1, total: usable.length }),
        tEn("pdf.coloursOption"));
    });
  }

  if (closing) {
    addPicturePage(closing.entry, closing.bytes, pageCount - (reward ? 1 : 0), tEn("pdf.aiImage"),
      tEn("pdf.coloursImage"), closing.entry.caption, tEn("pdf.disclaimerAi"));
  }

  if (reward) {
    const ops = rewardPageContent(reward, title, dateLine, pageCount, universalCodes);
    const content = ops.join("\n");
    const contentId = addObject([
      `<< /Length ${latin1(content).length} >>\nstream\n`, content, "\nendstream",
    ]);
    const annotIds = rewardLinkAnnots(reward).map((annot) => addObject([annot]));
    kids.push(addObject([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
        `/Resources << ${fontRes} >> /Contents ${contentId} 0 R ` +
        `/Annots [${annotIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    ]));
  }

  // Now that kids are known, fill in the Pages object body.
  doc.patch(pagesId, [
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`,
  ]);

  return doc.serialize(catalogId);
}

/**
 * One AI image on a sheet of its own — picture, the shades it was made in, and the
 * footer saying where those codes can be read.
 *
 * This is the small deliverable the product was missing. The board carries the AI image
 * as its closing page, which is right when somebody is finishing a job at a counter and
 * wants everything on one document — but it is the wrong shape for the far more common
 * moment afterwards: the customer has the picture, wants to send it to a painter or a
 * spouse, and does not want five pages of options they already chose between. Handing
 * them the raw JPEG instead loses the thing that makes it useful, which is the shade
 * table: a photograph of a room is not something anybody can buy paint from.
 *
 * <p>Deliberately the same generator, and therefore the same page — same palette strip,
 * same frame, same disclaimer, same "your paint shop can look these codes up" footer.
 * A one-page sheet that looked like a different product would undermine the board it was
 * cut from, and the layout is already built to be read on its own (the shade table is
 * anchored to the page bottom, not carried over from the page before).
 *
 * @param universalCodes whether these codes work at any HueVistaa counter or only back at
 *   the shop that issued them — decides one footer line, and getting it wrong sends
 *   somebody on a wasted trip.
 */
export function buildAiImagePdf(
  image: PdfAiImage,
  title = "HueVistaa",
  universalCodes = true,
): Uint8Array {
  return buildColourBoardPdf([], title, universalCodes, image, tEn("pdf.eyebrowAiImage"));
}

/** Whether the bytes are a JPEG this writer can place (C24 checks before promising a PDF). */
export function isReadableJpeg(bytes: Uint8Array | null | undefined): boolean {
  return readableJpeg(bytes) !== null;
}

/** The bytes when they are a JPEG whose size can be read, else null (swatches instead). */
function readableJpeg(bytes: Uint8Array | null | undefined): Uint8Array | null {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const { w, h } = jpegSize(bytes);
  return w > 0 && h > 0 ? bytes : null;
}
