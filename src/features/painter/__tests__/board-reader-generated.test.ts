import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The board reader's page is generated (scripts/build-board-reader.mjs) and committed.
 * This holds it to what it was built from: change the reader or the pinned pdf.js / jsQR
 * without building it again, and this fails. Read as text — the page itself is too big to
 * be worth importing here (jest.setup.ts stands in for it in the screens' tests).
 */
const ROOT = join(__dirname, "../../../..");
const source = readFileSync(join(ROOT, "src/features/painter/board-reader/reader-html.generated.ts"), "utf8");

describe("the board reader's page", () => {
  const inputs = JSON.parse(source.match(/export const READER_INPUTS: Record<string, string> = (\{[\s\S]*?\});/)![1]!) as Record<string, string>;
  const html = JSON.parse(source.match(/export const READER_HTML = (".*");/)![1]!) as string;

  it.each(Object.keys(inputs))("is built from the current %s", (path) => {
    expect(createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex")).toBe(inputs[path]);
  });

  it("covers the reader, pdf.js, its worker and jsQR", () => {
    expect(Object.keys(inputs)).toEqual(
      expect.arrayContaining(["scripts/board-reader/reader.js", "node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "node_modules/jsqr/dist/jsQR.js"]),
    );
  });

  // The file being read must have nowhere to go from inside the page.
  it("shuts the network off", () => {
    const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).not.toMatch(/https?:/);
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
  });

  it("is plain ASCII, under 2 MiB", () => {
    expect(/^[\x00-\x7f]*$/.test(html)).toBe(true);
    expect(html.length).toBeLessThan(2 * 1024 * 1024);
  });
});
