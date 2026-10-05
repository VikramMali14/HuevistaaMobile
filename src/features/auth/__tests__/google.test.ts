import { ApiError } from "@/api/errors";

import { exchangeGoogleCodeOnce, isRejectedGoogleCode, parseAuthCallback } from "../google";

const mockExchange = jest.fn();
jest.mock("@/api/endpoints/auth", () => ({
  authApi: { exchangeGoogleCode: (code: string, device?: string) => mockExchange(code, device) },
}));
jest.mock("@/auth/token-store", () => ({
  secureTokenStore: { readDeviceToken: jest.fn(async () => "device-1") },
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));

describe("parseAuthCallback", () => {
  it("reads the code from the fragment", () => {
    expect(parseAuthCallback("huevista://sign-in/callback#code=abc%2B1")).toEqual({ code: "abc+1" });
  });

  it("reads an error", () => {
    expect(parseAuthCallback("huevista://sign-in/callback#error=access_denied")).toEqual({ error: "access_denied" });
  });

  it("falls back to the query", () => {
    expect(parseAuthCallback("huevista://sign-in/callback?code=q1")).toEqual({ code: "q1" });
  });

  it("prefers the fragment when both are present", () => {
    expect(parseAuthCallback("huevista://sign-in/callback?code=q1#code=f1")).toEqual({ code: "f1" });
  });

  it("ignores empty, unknown and broken parts", () => {
    expect(parseAuthCallback("huevista://sign-in/callback#code=&state=x&code=%E0%A4")).toEqual({});
    expect(parseAuthCallback(null)).toEqual({});
    expect(parseAuthCallback("huevista://sign-in/callback")).toEqual({});
  });
});

describe("exchangeGoogleCodeOnce", () => {
  it("exchanges one code once, however many times it arrives", async () => {
    mockExchange.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    const [first, second] = await Promise.all([exchangeGoogleCodeOnce("same"), exchangeGoogleCodeOnce("same")]);
    expect(first).toBe(second);
    expect(mockExchange).toHaveBeenCalledTimes(1);
    expect(mockExchange).toHaveBeenCalledWith("same", "device-1");
  });

  it("exchanges a different code separately", async () => {
    mockExchange.mockClear();
    mockExchange.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    await exchangeGoogleCodeOnce("other");
    expect(mockExchange).toHaveBeenCalledWith("other", "device-1");
  });
});

describe("isRejectedGoogleCode", () => {
  it("is true for the backend turning the code down", () => {
    expect(isRejectedGoogleCode(new ApiError("http", 401, "used"))).toBe(true);
    expect(isRejectedGoogleCode(new ApiError("http", 400, "bad"))).toBe(true);
  });

  it("is false for no connection or a server fault", () => {
    expect(isRejectedGoogleCode(new ApiError("network", 0, "offline"))).toBe(false);
    expect(isRejectedGoogleCode(new ApiError("http", 500, "boom"))).toBe(false);
    expect(isRejectedGoogleCode(new Error("x"))).toBe(false);
  });
});
