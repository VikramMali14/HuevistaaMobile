/// <reference types="node" />

import fs from "node:fs";
import path from "node:path";

import { screens, type ScreenInfo } from "../screens";

const appDir = path.join(__dirname, "..", "..", "..", "app");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(full) : full.endsWith(".tsx") ? [full] : [];
  });
}

const entries = Object.entries(screens) as [string, ScreenInfo][];
const sources = routeFiles(appDir).map((file) => fs.readFileSync(file, "utf8"));

describe("the screen registry", () => {
  it("only links to screens that exist", () => {
    for (const [id, info] of entries) {
      for (const target of info.next ?? []) {
        expect({ from: id, to: target, exists: target in screens }).toEqual({ from: id, to: target, exists: true });
      }
    }
  });

  it("has exactly one placeholder for every planned screen", () => {
    for (const [id, info] of entries) {
      if (id === "A1") continue; // A1 is app/_layout.tsx + app/index.tsx, not a placeholder.
      const placeholders = sources.filter((src) => src.includes(`<PlannedScreen id="${id}"`)).length;
      expect({ id, placeholders }).toEqual({ id, placeholders: info.status === "planned" ? 1 : 0 });
    }
  });

  it("has no placeholder for a screen it does not know", () => {
    const ids = sources.flatMap((src) => [...src.matchAll(/<PlannedScreen id="(\w+)"/g)].map((m) => m[1]));
    for (const id of ids) expect(screens).toHaveProperty(id as string);
  });
});
