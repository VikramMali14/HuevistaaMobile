/**
 * Ported from HueVistaFrontEnd/src/lib/__tests__/pdf-export.test.ts (pictures as bytes),
 * plus what is the phone's own: a page with no picture prints swatches rather than being
 * dropped, and the reward page carries a real QR.
 */
import { create } from "qrcode/lib/core/qrcode";

import { buildAiImagePdf, buildColourBoardPdf, type PdfImageEntry } from "../pdf-export";

/** A minimal but structurally valid baseline JPEG: SOI, an SOF0 header with the size, EOI. */
function fakeJpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (h >> 8) & 0xff, h & 0xff,
    (w >> 8) & 0xff, w & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

/** The Latin-1 view is enough to read the object structure (JPEG payloads aside). */
function pdfText(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

const entry = (w = 640, h = 480): PdfImageEntry => ({
  jpeg: fakeJpeg(w, h),
  shades: [
    { label: "Main wall", name: "Off White", code: "7112", hex: "#f4efe6" },
    { label: "Accent wall", name: "Custom colour", hex: "#c73f8a" },
  ],
});

describe("buildColourBoardPdf", () => {
  it("produces a well-formed PDF with one page per entry", () => {
    const text = pdfText(buildColourBoardPdf([entry(), entry(800, 600)], "My room"));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBe(2);
    expect(text).toContain("/Count 2");
    expect(text).toContain("/Width 640");
    expect(text).toContain("/Width 800");
    expect(text).toContain("Shade No. 7112");
    expect(text).toContain("Off White");
    expect(text).toContain("/BaseFont /Helvetica ");
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("Made with HueVistaa");
    expect(text).toContain("Page 1 of 2");
    expect(text).toContain("Page 2 of 2");
    expect(text).toContain("Option 2 of 2");
  });

  it("emits a single notice page when there is nothing to print", () => {
    const text = pdfText(buildColourBoardPdf([]));
    expect(text).toContain("/Count 1");
    expect(text).toContain("No coloured images were added.");
  });

  it("prints an option with no picture as its swatches, never dropping it", () => {
    // Every option on the sheet is one the server records — a page can't go missing.
    const text = pdfText(
      buildColourBoardPdf([entry(), { jpeg: null, shades: entry().shades }, { jpeg: new Uint8Array([1, 2, 3]), shades: entry().shades }]),
    );
    expect(text).toContain("/Count 3");
    expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBe(1);
    expect(text).toContain("Option 3 of 3");
    // The swatch page paints the option's colours (#c73f8a → 0.78 0.25 0.54).
    expect(text).toContain("0.78 0.25 0.54 rg");
  });

  it("closes the board with a reward page that carries the QR and its address", () => {
    const qr = create("https://huevistaa.com/r/abc123", { errorCorrectionLevel: "Q" });
    const text = pdfText(
      buildColourBoardPdf([entry(), entry()], "My room", true, null, undefined, {
        modules: qr.modules,
        url: "https://huevistaa.com/r/abc123",
        expiresOn: "4 October 2026",
        paysPoints: true,
      }),
    );
    expect(text).toContain("/Count 3");
    expect(text).toContain("Page 3 of 3");
    expect(text).toContain("Option 2 of 2");
    expect(text).toContain("Scan this code when the job is done");
    expect(text).toContain("Scan in the painter app: painter.huevistaa.com");
    expect(text).toContain("huevistaa.com/r/abc123");
    expect(text).toContain("Points can be claimed until 4 October 2026");
    expect(text).toContain("/URI (https://huevistaa.com/r/abc123)");
  });

  it("speaks to the customer alone when the code pays no points", () => {
    const qr = create("https://huevistaa.com/r/abc123", { errorCorrectionLevel: "Q" });
    const text = pdfText(
      buildColourBoardPdf([entry()], "My room", true, null, undefined, { modules: qr.modules, url: "https://huevistaa.com/r/abc123", paysPoints: false }),
    );
    expect(text).toContain("Tell us how your room turned out.");
    expect(text).not.toContain("PAINT SHOP");
  });

  it("names the right counter for codes only the issuing shop can read", () => {
    expect(pdfText(buildColourBoardPdf([entry()], "x", true))).toContain("any HueVistaa shop can look these codes up");
    expect(pdfText(buildColourBoardPdf([entry()], "x", false))).toContain("your paint shop can look these codes up");
  });

  describe("the AI image page", () => {
    const aiImage = () => ({
      jpeg: fakeJpeg(1024, 768),
      shades: [{ label: "Main wall", name: "Off White", code: "7112", hex: "#f4efe6" }],
      caption: "Modern · Day · Natural light",
    });

    it("closes the board, numbered apart from the options", () => {
      const text = pdfText(buildColourBoardPdf([entry(), entry()], "My room", true, aiImage()));
      expect(text).toContain("/Count 3");
      expect(text).toContain("Page 3 of 3");
      expect(text).toContain("Option 2 of 2");
      expect(text).not.toContain("Option 3 of 3");
      expect(text).toContain("Your AI image");
    });

    it("is one page on its own sheet, saying what it is", () => {
      const text = pdfText(buildAiImagePdf(aiImage(), "My room"));
      expect(text).toContain("/Count 1");
      expect(text).toContain("HUEVISTA · AI IMAGE");
      expect(text).not.toContain("HUEVISTA · COLOUR BOARD");
    });
  });

  it("writes byte-accurate xref offsets (what makes the PDF actually open)", () => {
    const text = pdfText(buildColourBoardPdf([entry(), { jpeg: null, shades: entry().shades }]));
    const xrefOffset = Number(text.match(/startxref\s+(\d+)/)![1]);
    expect(text.slice(xrefOffset, xrefOffset + 4)).toBe("xref");
    const size = Number(text.slice(xrefOffset).match(/xref\s+0 (\d+)/)![1]);
    const entryRe = /(\d{10}) (\d{5}) (n|f) ?\r?\n/g;
    const rows: { off: number; type: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(text.slice(xrefOffset))) && rows.length < size) rows.push({ off: Number(m[1]), type: m[3]! });
    expect(rows.length).toBe(size);
    rows.forEach((row, i) => {
      if (i === 0 || row.type === "f") return;
      expect(text.slice(row.off, row.off + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    });
  });
});
