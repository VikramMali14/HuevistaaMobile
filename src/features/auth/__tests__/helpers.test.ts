import { ApiError } from "@/api/errors";
import type { UserProfile } from "@/api/types";

import { authErrorMessage, fieldError } from "../errors";
import { finishSignIn } from "../sign-in";
import { formatCountdown, secondsParam } from "../use-countdown";

jest.mock("@/auth/token-store", () => ({ secureTokenStore: { readDeviceToken: jest.fn(async () => null) } }));

describe("authErrorMessage", () => {
  it("shows a sign-in endpoint's own 4xx reason", () => {
    expect(authErrorMessage(new ApiError("http", 400, "Incorrect code. 2 attempts left."))).toBe(
      "Incorrect code. 2 attempts left.",
    );
    expect(authErrorMessage(new ApiError("http", 401, "That account is closed."))).toBe("That account is closed.");
  });

  it("uses the app's sentences for rate limits, server faults and no connection", () => {
    expect(authErrorMessage(new ApiError("http", 429, "Too Many Requests"))).toBe(
      "Too many tries. Wait a few minutes and try again.",
    );
    expect(authErrorMessage(new ApiError("http", 503, "upstream"))).toBe(
      "Something went wrong on our side. Try again in a moment.",
    );
    expect(authErrorMessage(new ApiError("network", 0, ""))).toBe("No connection. Check your internet and try again.");
  });

  it("says something in the app's own words when the server gave no reason", () => {
    expect(authErrorMessage(new ApiError("http", 400, ""))).toBe("That didn't go through. Try again.");
  });

  it("reads a field's message", () => {
    const err = new ApiError("http", 400, "Validation failed", { phone: "Enter a valid mobile number" });
    expect(fieldError(err, "phone")).toBe("Enter a valid mobile number");
    expect(fieldError(err, "email")).toBeNull();
    expect(fieldError(new Error("x"), "phone")).toBeNull();
  });
});

describe("finishSignIn", () => {
  const profile: UserProfile = { id: "u1", name: "Priya", provider: "LOCAL", role: "CUSTOMER" };
  const complete = jest.fn(async () => profile);

  beforeEach(() => complete.mockClear());

  it("opens the session when tokens arrive", async () => {
    await expect(finishSignIn({ accessToken: "a", refreshToken: "r" }, complete)).resolves.toEqual({
      kind: "signedIn",
      profile,
    });
    expect(complete).toHaveBeenCalled();
  });

  it("asks a shop for its emailed code, without opening a session", async () => {
    await expect(
      finishSignIn({ emailCodeRequired: true, challengeToken: "ch", emailHint: "s***@x.com" }, complete),
    ).resolves.toEqual({ kind: "emailCode", challengeToken: "ch", emailHint: "s***@x.com" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("turns an admin away", async () => {
    await expect(finishSignIn({ twoFactorRequired: true }, complete)).resolves.toEqual({ kind: "admin" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses an answer with neither tokens nor a next step", async () => {
    await expect(finishSignIn({}, complete)).rejects.toThrow();
  });
});

describe("countdown helpers", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(42)).toBe("0:42");
    expect(formatCountdown(75)).toBe("1:15");
    expect(formatCountdown(-3)).toBe("0:00");
  });

  it("reads seconds from a route param, keeping 0 as a real answer", () => {
    expect(secondsParam("0", 30)).toBe(0);
    expect(secondsParam("45", 30)).toBe(45);
    expect(secondsParam("12.9", 30)).toBe(12);
    expect(secondsParam(undefined, 30)).toBe(30);
    expect(secondsParam("", 30)).toBe(30);
    expect(secondsParam("soon", 30)).toBe(30);
    expect(secondsParam("-5", 30)).toBe(30);
  });
});
