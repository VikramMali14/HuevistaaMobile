import type { ErrorEvent } from "@sentry/react-native";

import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from "../crash-reports";

// Nothing personal or secret leaves the phone in a crash report.
describe("crash reports", () => {
  it("takes emails, phone numbers, tokens and push addresses out of text", () => {
    expect(scrubText("priya@example.com couldn't sign in")).toBe("[email] couldn't sign in");
    expect(scrubText("Sent to +91 98765 43210")).toBe("Sent to [number]");
    expect(scrubText("Authorization: Bearer abc.def.ghi")).toBe("Authorization: Bearer [token]");
    expect(scrubText("ExponentPushToken[xxxxyyyy] failed")).toBe("[push token] failed");
    expect(scrubText("Room HV0348 failed after 3 tries")).toBe("Room HV0348 failed after 3 tries");
  });

  it("drops queries and ids from addresses", () => {
    expect(scrubUrl("https://api.huevistaa.com/api/share/0123456789abcdef0123456789abcdef?x=1#y")).toBe("https://api.huevistaa.com/api/share/:id");
    expect(scrubUrl("https://api.huevistaa.com/api/nearby/painters?lat=15.85&lon=74.5")).toBe("https://api.huevistaa.com/api/nearby/painters");
    expect(scrubUrl("/r/0VkTlzUw5CGJ-bTtxixeiS0nVfg")).toBe("/r/:id");
  });

  it("keeps a breadcrumb's address and status, never its body or what was typed", () => {
    expect(scrubBreadcrumb({ category: "ui.input", message: "typed 98765 43210" })).toBeNull();
    expect(
      scrubBreadcrumb({ category: "fetch", data: { url: "https://api.huevistaa.com/api/auth/phone/verify?code=123456", method: "POST", status_code: 200, request_body: "{\"code\":\"123456\"}" } }),
    ).toEqual({ category: "fetch", data: { url: "https://api.huevistaa.com/api/auth/phone/verify", method: "POST", status_code: 200 } });
    expect(scrubBreadcrumb({ category: "navigation", data: { from: "/share/0123456789abcdef0123456789abcdef", to: "/welcome" } })?.data).toEqual({
      from: "/share/:id",
      to: "/welcome",
    });
  });

  it("keeps only the account's id, and no request details", () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: "u1", email: "priya@example.com", ip_address: "1.2.3.4" },
      request: { url: "https://api.huevistaa.com/api/rewards/0VkTlzUw5CGJ-bTtxixeiS0nVfg/claim?x=1", headers: { Authorization: "Bearer t" }, data: "{}" },
      exception: { values: [{ type: "Error", value: "No account for priya@example.com" }] },
      extra: { phone: "9876543210" },
    } as ErrorEvent);
    expect(event.user).toEqual({ id: "u1" });
    expect(event.request).toEqual({ url: "https://api.huevistaa.com/api/rewards/:id/claim", method: undefined });
    expect(event.exception?.values?.[0]?.value).toBe("No account for [email]");
    expect(event.extra).toBeUndefined();
  });
});
