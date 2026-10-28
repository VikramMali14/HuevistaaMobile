import * as WebBrowser from "expo-web-browser";
import { AppState, Platform } from "react-native";

import { queryClient } from "@/api/query-client";
import { keys } from "@/api/query-keys";
import * as env from "@/config/env";

import { buyOnWebsite, whereToBuy } from "../where-to-buy";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "opened" })) }));

afterEach(() => jest.restoreAllMocks());

describe("where a session is sold rooms and Vista credits", () => {
  it("a homeowner's own account buys in the app, in either build", () => {
    for (const mode of ["web", "play"] as const) {
      jest.spyOn(env, "paymentsMode").mockReturnValue(mode);
      expect(whereToBuy({ linkedProfile: false })).toBe("app");
      expect(whereToBuy({})).toBe("app");
      expect(whereToBuy(null)).toBe("app");
    }
  });

  it("a painter's or a shop's own home buys on the website — and in the store build, nowhere the app may name", () => {
    jest.spyOn(env, "paymentsMode").mockReturnValue("web");
    expect(whereToBuy({ linkedProfile: true })).toBe("website");
    jest.spyOn(env, "paymentsMode").mockReturnValue("play");
    expect(whereToBuy({ linkedProfile: true })).toBe("none");
  });
});

describe("buying on the website", () => {
  const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;
  const appState = AppState.addEventListener as jest.Mock;
  beforeEach(() => openBrowser.mockClear());

  it("opens the customer's balance, by way of Continue as…", async () => {
    jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await buyOnWebsite();
    expect(openBrowser).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/[^/]+\/choose-profile\?next=%2Fmy-projects$/), expect.anything());
  });

  it("reads the balances again once the browser has closed (iOS)", async () => {
    const invalidate = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await buyOnWebsite();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.aiCredits });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.projectOptions });
  });

  it("on Android, whose browser answers as it opens, reads them again once the app is back in front", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const invalidate = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const from = appState.mock.calls.length;
    await buyOnWebsite();
    expect(invalidate).not.toHaveBeenCalled();
    const listeners = appState.mock.calls.slice(from).filter(([type]) => type === "change").map(([, listener]) => listener);
    expect(listeners).toHaveLength(1);
    listeners[0]("background");
    expect(invalidate).not.toHaveBeenCalled();
    listeners[0]("active");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.aiCredits });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.entitlement });
  });
});
