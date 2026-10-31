/**
 * Proves the pin map's page (P5) in a real browser, which Jest can't: MapLibre needs WebGL,
 * and the map needs OpenFreeMap.
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright node scripts/verify-pin-map.mjs
 *
 * It loads the generated page in Chromium as a WebView does — on its own, with no origin — plays
 * the app's side of the protocol (what PinMapSession sends) and checks:
 *   - started on a pin, the map draws and says it is ready;
 *   - a drag is told to the app, to five decimal places;
 *   - the app's own "show" (a town typed) moves the map without being told back;
 *   - held while the screen saves, a tap does nothing; let go, a tap moves the pin there;
 *   - no border lines are drawn, place names are;
 *   - nothing is fetched from anywhere but OpenFreeMap.
 * It needs the network (set HTTPS_PROXY to go through a proxy). Playwright isn't a dependency of
 * this app; point PLAYWRIGHT at any install of it.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const source = readFileSync(join(ROOT, "src/features/painter/pin-map/map-html.generated.ts"), "utf8");
const HTML = JSON.parse(source.match(/export const MAP_HTML = (".*");/)[1]);
const STYLE = source.includes("tiles.openfreemap.org") ? "https://tiles.openfreemap.org/styles/liberty" : null;
const HOME = { latitude: 26.45123, longitude: 74.63987 };
const JAIPUR = { latitude: 26.9124, longitude: 75.7873 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  // Software WebGL, as a phone without a GPU driver the browser trusts would draw it.
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined,
});
const context = await browser.newContext({ viewport: { width: 360, height: 300 }, ignoreHTTPSErrors: Boolean(process.env.HTTPS_PROXY) });
const page = await context.newPage();
let failures = 0;

function expect(what, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failures += 1;
}

const hosts = new Set();
page.on("request", (r) => {
  const url = new URL(r.url());
  if (url.protocol.startsWith("http")) hosts.add(url.host);
});
await page.addInitScript(() => {
  window.__heard = [];
  window.ReactNativeWebView = { postMessage: (text) => window.__heard.push(JSON.parse(text)) };
  // Keep hold of the map the page makes, to look at its style: MapLibre puts itself on the
  // window, and the page's map is the one whose style is set.
  let gl;
  Object.defineProperty(window, "maplibregl", {
    configurable: true,
    get: () => gl,
    set: (value) => {
      gl = value;
      const setStyle = value.Map.prototype.setStyle;
      value.Map.prototype.setStyle = function (...args) {
        window.__map = this;
        return setStyle.apply(this, args);
      };
    },
  });
});
await page.goto("about:blank");
await page.setContent(HTML);

const heard = () => page.evaluate(() => window.__heard.slice());
const tell = (message) => page.evaluate((text) => document.dispatchEvent(new MessageEvent("message", { data: text })), JSON.stringify(message));
const moves = async () => (await heard()).filter((m) => m.type === "moved");
const settle = (ms = 1500) => page.waitForTimeout(ms);

await page.waitForFunction(() => window.__heard.some((m) => m.type === "loaded"), null, { timeout: 15000 });
await tell({ type: "start", pin: HOME, zoom: 15.5, style: STYLE, labels: { "NavigationControl.ZoomIn": "Zoom in" }, held: false });
await page.waitForFunction(() => window.__heard.some((m) => m.type === "ready" || m.type === "failed"), null, { timeout: 30000 }).catch(() => {});
expect("draws the map and says it is ready", (await heard()).some((m) => m.type === "ready"));
const layers = await page.evaluate(() => window.__map.getStyle().layers.map((layer) => layer["source-layer"]));
expect("draws no border lines", layers.length > 0 && !layers.includes("boundary"));
expect("but draws place names", layers.includes("place"));

await page.mouse.move(180, 150);
await page.mouse.down();
await page.mouse.move(100, 100, { steps: 10 });
await page.mouse.up();
await settle();
const [dragged] = await moves();
expect("tells the app of a drag", Boolean(dragged));
expect("to five decimal places", Boolean(dragged) && [dragged.latitude, dragged.longitude].every((d) => Math.round(d * 1e5) / 1e5 === d));
// The map follows the finger up and to the left, so what comes under the pin lay south-east of it.
expect("south-east of the pin, the map dragged up and left", Boolean(dragged) && dragged.latitude < HOME.latitude && dragged.longitude > HOME.longitude);

await tell({ type: "show", pin: JAIPUR, zoom: 13 });
await settle(3000);
expect("goes to a town typed without telling it back", (await moves()).length === 1);

await tell({ type: "hold", held: true });
await page.mouse.click(250, 200);
await settle();
expect("holds still while the screen saves", (await moves()).length === 1);

await tell({ type: "hold", held: false });
await page.mouse.click(250, 200);
await settle();
const tapped = (await moves())[1];
expect("moves the pin to a tap, near the town", Boolean(tapped) && Math.abs(tapped.latitude - JAIPUR.latitude) < 0.05 && Math.abs(tapped.longitude - JAIPUR.longitude) < 0.05);

expect(`fetches from OpenFreeMap only (${[...hosts].join(", ")})`, [...hosts].every((h) => h === "tiles.openfreemap.org"));

await browser.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("pin map: all checks passed");
