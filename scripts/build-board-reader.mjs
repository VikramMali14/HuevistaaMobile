/**
 * Builds the board reader's page (P7): src/features/painter/board-reader/reader-html.generated.ts.
 *
 *   node scripts/build-board-reader.mjs
 *
 * Run it after changing scripts/board-reader/reader.js or the pinned pdfjs-dist / jsqr
 * (devDependencies, pinned exactly). A test (board-reader-generated.test.ts) fails while
 * the committed page is out of step with its inputs.
 *
 * One HTML page, with everything in it and nothing fetched: pdf.js's legacy build (for the
 * older WebViews still about) with its worker run in the page itself, jsQR, and the
 * reader. The page's content security policy shuts off the network entirely, so the file
 * being read can't be sent anywhere from inside it.
 *
 * pdf.js ships as ES modules. They are made into plain scripts here: the export at the end
 * goes (both builds also put what they export on globalThis.pdfjsLib / pdfjsWorker), the
 * `import.meta.url` only Node reaches is stubbed, and each is wrapped in its own function
 * so their minified top-level names don't collide. Every character is kept ASCII, so the
 * page reads the same however a WebView guesses its encoding.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { minify } = require("terser");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/features/painter/board-reader/reader-html.generated.ts");

const PDFJS_VERSION = "4.10.38";
const JSQR_VERSION = "1.4.0";

const inputs = {
  pdf: join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.min.mjs"),
  worker: join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  jsqr: join(ROOT, "node_modules/jsqr/dist/jsQR.js"),
  reader: join(ROOT, "scripts/board-reader/reader.js"),
  generator: fileURLToPath(import.meta.url),
};

function check(condition, message) {
  if (!condition) {
    console.error(`build-board-reader: ${message}`);
    process.exit(1);
  }
}

check(require("pdfjs-dist/package.json").version === PDFJS_VERSION, `pdfjs-dist must be ${PDFJS_VERSION} (npm ci)`);
check(require("jsqr/package.json").version === JSQR_VERSION, `jsqr must be ${JSQR_VERSION} (npm ci)`);

const read = (path) => readFileSync(path, "utf8");

/** Every character above 0x7f as an escape — valid in strings, regexes and identifiers alike. */
function ascii(code) {
  return code.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** A pdf.js module as a plain script. */
function plainScript(code, name, metaCount, importCount) {
  const exports = code.match(/export\s*\{[^}]*\}\s*;?\s*$/);
  check(exports, `${name}: no export at the end — has the build changed shape?`);
  let body = code.slice(0, exports.index);
  check(!/\bexport\s*\{/.test(body), `${name}: a second export`);
  // pdf.js imports its worker only when none is in the page (here one always is), and the
  // content security policy would refuse it anyway. Counted, so a new one is looked at.
  const imports = body.match(/\bimport\s*\(/g) ?? [];
  check(imports.length === importCount, `${name}: expected ${importCount} import(), found ${imports.length}`);
  const metas = body.match(/import\.meta\.url/g) ?? [];
  check(metas.length === metaCount, `${name}: expected ${metaCount} import.meta.url, found ${metas.length}`);
  body = body.replace(/import\.meta\.url/g, '"about:blank"');
  return `(function(){"use strict";\n${body}\n})();`;
}

/** Nothing in a script may end the <script> element it sits in. */
function safeInHtml(code, name) {
  check(!/<\/script/i.test(code) && !/<!--/.test(code) && !/<script/i.test(code), `${name}: holds markup that would break the page`);
  return code;
}

const pdf = plainScript(read(inputs.pdf), "pdf.min.mjs", 2, 2);
const worker = plainScript(read(inputs.worker), "pdf.worker.min.mjs", 0, 0);
const jsqr = (await minify(read(inputs.jsqr), { compress: true, mangle: true, format: { ascii_only: true, comments: /Apache|license/i } })).code;
const reader = (await minify(read(inputs.reader), { compress: true, mangle: true, format: { ascii_only: true, comments: false } })).code;

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src blob: data:",
  "font-src blob: data:",
  "connect-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const scripts = [
  [`pdf.js ${PDFJS_VERSION} (legacy build), Apache-2.0`, pdf],
  [`pdf.js ${PDFJS_VERSION} worker, run in this page`, worker],
  [`jsQR ${JSQR_VERSION}, Apache-2.0`, jsqr],
  ["HueVistaa board reader (scripts/board-reader/reader.js)", reader],
].map(([label, code]) => `<script>/* ${label} */\n${safeInHtml(ascii(code), label)}\n</script>`);

const html = [
  "<!doctype html>",
  '<html><head><meta charset="utf-8">',
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  "</head><body>",
  ...scripts,
  "</body></html>",
].join("\n");

check(/^[\x00-\x7f]*$/.test(html), "the page isn't ASCII");
check(html.length < 2 * 1024 * 1024, `the page is ${html.length} bytes — over 2 MiB`);

const sha = (text) => createHash("sha256").update(text).digest("hex");
const hashes = Object.fromEntries(Object.values(inputs).map((path) => [relative(ROOT, path), sha(readFileSync(path))]));

writeFileSync(
  OUT,
  [
    "// Generated by scripts/build-board-reader.mjs from the files below — do not edit; run it again.",
    "// pdf.js and jsQR are Apache-2.0 (their notices are kept inside the page).",
    "/* eslint-disable */",
    "",
    `/** What the page was built from, by sha-256; a test holds the committed page to it. */`,
    `export const READER_INPUTS: Record<string, string> = ${JSON.stringify(hashes, null, 2)};`,
    "",
    `export const READER_HTML = ${JSON.stringify(html)};`,
    "",
  ].join("\n"),
);

console.log(`board reader: ${(html.length / 1024).toFixed(0)} KiB → ${relative(ROOT, OUT)}`);
