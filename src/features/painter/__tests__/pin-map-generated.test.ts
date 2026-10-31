import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAP_ORIGIN, MAP_STYLE_URL } from "../pin-map/protocol";

/**
 * The pin map's page is generated (scripts/build-pin-map.mjs) and committed. This holds it to
 * what it was built from: change the page's script or the pinned MapLibre without building it
 * again, and this fails. Read as text — jest.setup.ts stands in for the page in the screens' tests.
 */
const ROOT = join(__dirname, "../../../..");
const source = readFileSync(join(ROOT, "src/features/painter/pin-map/map-html.generated.ts"), "utf8");

describe("the pin map's page", () => {
  const inputs = JSON.parse(source.match(/export const MAP_INPUTS: Record<string, string> = (\{[\s\S]*?\});/)![1]!) as Record<string, string>;
  const html = JSON.parse(source.match(/export const MAP_HTML = (".*");/)![1]!) as string;

  it.each(Object.keys(inputs))("is built from the current %s", (path) => {
    expect(createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex")).toBe(inputs[path]);
  });

  it("covers the page's script and MapLibre", () => {
    expect(Object.keys(inputs)).toEqual(
      expect.arrayContaining(["scripts/pin-map/map.js", "node_modules/maplibre-gl/dist/maplibre-gl.js", "node_modules/maplibre-gl/dist/maplibre-gl.css"]),
    );
  });

  // The map's style, tiles, fonts and icons — and no other site is reached from inside it.
  it("reaches OpenFreeMap and nothing else", () => {
    const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain(`connect-src ${MAP_ORIGIN};`);
    expect(new Set(policy.match(/https?:\/\/[^\s;]+/g))).toEqual(new Set([MAP_ORIGIN]));
    expect(MAP_STYLE_URL.startsWith(`${MAP_ORIGIN}/`)).toBe(true);
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
  });

  it("is plain ASCII, under 1.5 MiB", () => {
    expect(/^[\x00-\x7f]*$/.test(html)).toBe(true);
    expect(html.length).toBeLessThan(1.5 * 1024 * 1024);
  });
});
