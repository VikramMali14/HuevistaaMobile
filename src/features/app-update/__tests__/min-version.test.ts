import { Platform } from "react-native";

import { compareVersions, gateFor } from "../min-version";

const STORE = "https://play.google.com/store/apps/details?id=com.gridstore.huevistaa";
const answer = (minimumVersion: string | null, latestVersion: string | null = null, storeUrl: string | null = STORE) => {
  const mine = { minimumVersion, latestVersion, storeUrl };
  return { android: mine, ios: mine };
};

describe("X5 · the minimum version", () => {
  it("compares versions part by part, a missing part being 0", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0", "not a version")).toBeNull();
  });

  it("blocks a version below the minimum, only with a store to go to", () => {
    expect(Platform.OS === "ios" || Platform.OS === "android").toBe(true);
    expect(gateFor(answer("0.2.0"), "0.1.0")).toEqual({ blocked: true, updateAvailable: false, storeUrl: STORE });
    expect(gateFor(answer("0.1.0"), "0.1.0").blocked).toBe(false);
    expect(gateFor(answer("0.2.0", null, null), "0.1.0").blocked).toBe(false);
    expect(gateFor(answer("0.2.0", null, "http://insecure.example"), "0.1.0").blocked).toBe(false);
  });

  it("never blocks on an answer it can't read", () => {
    expect(gateFor(null, "0.1.0").blocked).toBe(false);
    expect(gateFor(answer("ten"), "0.1.0").blocked).toBe(false);
    expect(gateFor({ android: null, ios: null }, "0.1.0").blocked).toBe(false);
  });

  it("says when a newer version is out, without blocking", () => {
    expect(gateFor(answer("0.1.0", "0.3.0"), "0.1.0")).toEqual({ blocked: false, updateAvailable: true, storeUrl: STORE });
  });
});
