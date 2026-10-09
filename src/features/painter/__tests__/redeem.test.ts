import { ApiError } from "@/api/errors";

import { displayPhone, isUnanswered, RequestKey } from "../redeem";

describe("redeeming (P9)", () => {
  // The server answers a repeated key with the redemption it already made, so a retry
  // after a lost answer must reuse the key — and a new press must not.
  it("keeps one key across retries, and makes a new one once settled", () => {
    const key = new RequestKey();
    const first = key.current();
    expect(key.current()).toBe(first);
    key.settled();
    const second = key.current();
    expect(second).not.toBe(first);
    expect(second.length).toBeGreaterThan(8);
  });

  it("treats no answer, a timeout and a server fault as unanswered — never a refusal", () => {
    expect(isUnanswered(new ApiError("network", 0, "offline"))).toBe(true);
    expect(isUnanswered(new ApiError("http", 503, "busy"))).toBe(true);
    expect(isUnanswered(new Error("boom"))).toBe(true);
    expect(isUnanswered(new ApiError("http", 402, "short"))).toBe(false);
    expect(isUnanswered(new ApiError("http", 409, "out of stock"))).toBe(false);
  });

  it("shows an Indian mobile the way it is said", () => {
    expect(displayPhone("+919876543210")).toBe("+91\u00a098765\u00a043210");
    expect(displayPhone("+447700900123")).toBe("+447700900123");
    expect(displayPhone(null)).toBe("");
  });
});
