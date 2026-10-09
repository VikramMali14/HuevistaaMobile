/**
 * Proves the board reader's page (P7) in a real browser, which Jest can't: pdf.js needs a
 * real canvas.
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright node scripts/verify-board-reader.mjs
 *
 * It loads the generated page in Chromium with the network cut off, plays the app's side
 * of the protocol (the same chunks and verdicts BoardReader sends) and checks:
 *   - a real colour board (fixtures/colour-board.pdf, made by the studio's own board
 *     builder) gives back the token printed under its QR, from the last page;
 *   - a photo of that page gives it back too;
 *   - a PDF with no QR, a file that isn't a PDF, and a broken image each end as they should;
 *   - a QR that isn't ours is offered, refused, and the reading carries on.
 * Playwright isn't a dependency of this app; point PLAYWRIGHT at any install of it.
 */
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const source = readFileSync(join(ROOT, "src/features/painter/board-reader/reader-html.generated.ts"), "utf8");
const HTML = JSON.parse(source.match(/export const READER_HTML = (".*");/)[1]);
const BOARD = readFileSync(join(ROOT, "scripts/board-reader/fixtures/colour-board.pdf"));
const TOKEN = "0VkTlzUw5CGJ-bTtxixeiS0nVfg";
const CHUNK = 256 * 1024;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const context = await browser.newContext({ offline: true });
let failures = 0;

/** Plays the app: sends the file in chunks, answers each offer, and returns how it ended. */
async function readWith(bytes, kind, mime, isOurs = (text) => text.includes(`/r/${TOKEN}`)) {
  const page = await context.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  const messages = [];
  let settle;
  const ended = new Promise((resolve) => (settle = resolve));
  const post = (message) => page.evaluate((m) => window.dispatchEvent(new MessageEvent("message", { data: m })), JSON.stringify(message));
  let acked = Promise.resolve();
  let ack = () => {};

  await page.exposeFunction("__toApp", async (text) => {
    const message = JSON.parse(text);
    messages.push(message);
    if (message.type === "ready") {
      const base64 = Buffer.from(bytes).toString("base64");
      await post({ type: "begin", kind, mime, size: bytes.length });
      for (let at = 0, seq = 0; at < base64.length; at += CHUNK, seq++) {
        acked = new Promise((resolve) => (ack = resolve));
        await post({ type: "chunk", seq, data: base64.slice(at, at + CHUNK) });
        await acked;
      }
      await post({ type: "end" });
    } else if (message.type === "ack") ack();
    else if (message.type === "found") {
      const ours = isOurs(message.text);
      await post({ type: "verdict", ours });
      if (ours) settle({ end: "found", text: message.text, page: message.page });
    } else if (message.type === "none") settle({ end: "none" });
    else if (message.type === "error") settle({ end: "error", code: message.code, detail: message.detail });
  });
  // Before the page goes in: setContent writes into this same window, which keeps it.
  await page.evaluate(() => {
    window.ReactNativeWebView = { postMessage: (text) => window.__toApp(text) };
  });
  await page.setContent(HTML);
  const outcome = await Promise.race([ended, new Promise((resolve) => setTimeout(() => resolve({ end: "timeout" }), 60000))]);
  await page.close();
  return { ...outcome, messages, requests: requests.filter((u) => !u.startsWith("about:") && !u.startsWith("data:") && !u.startsWith("blob:")) };
}

function expect(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

// 1 · The real board: found on the last page (looked at first), nothing fetched.
const board = await readWith(BOARD, "pdf", "application/pdf");
const progress = board.messages.filter((m) => m.type === "progress");
expect("a colour board gives its token", board.end === "found" && board.text.includes(TOKEN), board);
expect("from its last page, the first one looked at", board.page === 4 && progress.length === 1 && progress[0].page === 4 && progress[0].pages === 4, { page: board.page, progress });
expect("nothing is fetched", board.requests.length === 0, board.requests);

// 2 · A photo of that page: drawn by pdf.js in a page of its own, then read as an image.
const shot = await context.newPage();
await shot.setContent(HTML);
const png = await shot.evaluate(async (b64) => {
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await globalThis.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const page = await doc.getPage(doc.numPages);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png").split(",")[1];
}, BOARD.toString("base64"));
await shot.close();
const photo = await readWith(Buffer.from(png, "base64"), "image", "image/png");
expect("a photo of the last page gives the token", photo.end === "found" && photo.text.includes(TOKEN), photo);

// 3 · Someone else's QR: offered, refused, and the reading goes on to the end.
const refused = await readWith(BOARD, "pdf", "application/pdf", () => false);
const offers = refused.messages.filter((m) => m.type === "found");
expect("a QR that isn't ours is refused and reading carries on", refused.end === "none" && offers.length === 1, { end: refused.end, offers });
const order = refused.messages.filter((m) => m.type === "progress").map((m) => m.page);
expect("every page is looked at, last first, then the first", order.join() === "4,1,3,2", order);

// 4 · A PDF with nothing to find.
const blank = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);
const empty = await readWith(blank, "pdf", "application/pdf");
expect("a PDF with no QR ends with none", empty.end === "none", empty);

// 5 · Not a PDF at all, and an image that isn't one.
const junk = await readWith(Buffer.from("this is not a pdf, it is a shopping list".repeat(20)), "pdf", "application/pdf");
expect("a file that isn't a PDF is unreadable", junk.end === "error" && junk.code === "unreadable", junk);
const broken = await readWith(Buffer.from("not an image"), "image", "image/jpeg");
expect("a broken image says so", broken.end === "error" && broken.code === "image", broken);

await browser.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
