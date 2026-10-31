/**
 * Builds the pin map's page (P5): src/features/painter/pin-map/map-html.generated.ts.
 *
 *   node scripts/build-pin-map.mjs
 *
 * Run it after changing scripts/pin-map/map.js or the pinned maplibre-gl (a devDependency,
 * pinned exactly). A test (pin-map-generated.test.ts) fails while the committed page is out
 * of step with its inputs.
 *
 * One HTML page with MapLibre GL JS and its stylesheet in it, so only the map itself is
 * fetched: the page's content security policy lets it reach OpenFreeMap — the style, tiles,
 * fonts and icons, all from one origin — and nothing else, and MapLibre starts its worker from
 * a blob. Every character is kept ASCII, so the page reads the same however a WebView guesses
 * its encoding.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { minify } = require("terser");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/features/painter/pin-map/map-html.generated.ts");

const MAPLIBRE_VERSION = "5.24.0";

/** Must agree with MAP_ORIGIN in src/features/painter/pin-map/protocol.ts. */
const MAP_ORIGIN = "https://tiles.openfreemap.org";

const inputs = {
  maplibre: join(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl.js"),
  css: join(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl.css"),
  map: join(ROOT, "scripts/pin-map/map.js"),
  generator: fileURLToPath(import.meta.url),
};

function check(condition, message) {
  if (!condition) {
    console.error(`build-pin-map: ${message}`);
    process.exit(1);
  }
}

check(require("maplibre-gl/package.json").version === MAPLIBRE_VERSION, `maplibre-gl must be ${MAPLIBRE_VERSION} (npm ci)`);

const read = (path) => readFileSync(path, "utf8");

/** Every character above 0x7f as an escape — valid in strings, regexes and identifiers alike. */
function ascii(code) {
  return code.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Nothing in a script or stylesheet may end the element it sits in. */
function safeInHtml(code, name) {
  check(!/<\/(script|style)/i.test(code) && !/<!--/.test(code) && !/<script/i.test(code), `${name}: holds markup that would break the page`);
  return code;
}

const maplibre = read(inputs.maplibre);
const css = read(inputs.css);
check(/^[\x00-\x7f]*$/.test(css), "maplibre-gl.css isn't ASCII — escape it as CSS, not as JavaScript");
const map = (await minify(read(inputs.map), { compress: true, mangle: true, format: { ascii_only: true, comments: false } })).code;

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  `img-src data: blob: ${MAP_ORIGIN}`,
  `connect-src ${MAP_ORIGIN}`,
  // MapLibre's worker, from a blob; child-src for the WebViews that read workers from it.
  "worker-src blob:",
  "child-src blob:",
  "font-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

// The pin is the app's brass (theme accent / accentDeep / accentOn on light), on a map that is
// always light. It stands in the middle, its point on the place; lifted while the map moves.
const PAGE_CSS = [
  "html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#f2efe8;-webkit-tap-highlight-color:transparent}",
  "#map{position:absolute;top:0;left:0;right:0;bottom:0}",
  "#pin{position:absolute;left:50%;top:50%;width:34px;height:44px;transform:translate(-50%,-100%);pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transition:transform 140ms cubic-bezier(.22,.75,.2,1)}",
  "#pin path{fill:#c08b4e;stroke:#9a6a33;stroke-width:1.5}",
  "#pin circle{fill:#fffdf8}",
  "body.moving #pin{transform:translate(-50%,calc(-100% - 8px))}",
  "#spot{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(0,0,0,.35);pointer-events:none}",
  "@media (prefers-reduced-motion:reduce){#pin{transition:none}}",
].join("\n");

const scripts = [
  [`MapLibre GL JS ${MAPLIBRE_VERSION}, BSD-3-Clause`, maplibre],
  ["HueVistaa pin map (scripts/pin-map/map.js)", map],
].map(([label, code]) => `<script>/* ${label} */\n${safeInHtml(ascii(code), label)}\n</script>`);

const html = [
  "<!doctype html>",
  '<html><head><meta charset="utf-8">',
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
  `<style>/* MapLibre GL JS ${MAPLIBRE_VERSION} */\n${safeInHtml(css, "maplibre-gl.css")}\n${PAGE_CSS}\n</style>`,
  "</head><body>",
  '<div id="map"></div>',
  '<svg id="pin" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 43s14-14.3 14-26A14 14 0 0 0 3 17c0 11.7 14 26 14 26z"/><circle cx="17" cy="17" r="5.2"/></svg>',
  '<span id="spot" aria-hidden="true"></span>',
  ...scripts,
  "</body></html>",
].join("\n");

check(/^[\x00-\x7f]*$/.test(html), "the page isn't ASCII");
check(html.length < 1.5 * 1024 * 1024, `the page is ${html.length} bytes — over 1.5 MiB`);

const sha = (text) => createHash("sha256").update(text).digest("hex");
const hashes = Object.fromEntries(Object.values(inputs).map((path) => [relative(ROOT, path), sha(readFileSync(path))]));

writeFileSync(
  OUT,
  [
    "// Generated by scripts/build-pin-map.mjs from the files below — do not edit; run it again.",
    "// MapLibre GL JS is BSD-3-Clause (its notice is kept inside the page).",
    "/* eslint-disable */",
    "",
    `/** What the page was built from, by sha-256; a test holds the committed page to it. */`,
    `export const MAP_INPUTS: Record<string, string> = ${JSON.stringify(hashes, null, 2)};`,
    "",
    `export const MAP_HTML = ${JSON.stringify(html)};`,
    "",
  ].join("\n"),
);

console.log(`pin map: ${(html.length / 1024).toFixed(0)} KiB → ${relative(ROOT, OUT)}`);
