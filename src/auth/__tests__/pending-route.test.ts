import {
  forgetRememberedRoute,
  isRememberablePath,
  peekRememberedRoute,
  rememberRoute,
} from "../pending-route";

afterEach(() => forgetRememberedRoute());

describe("isRememberablePath", () => {
  it.each(["/room/abc/paint", "/boards/b1?from=share", "/painter/scan", "/home"])("accepts %s", (path) => {
    expect(isRememberablePath(path)).toBe(true);
  });

  it.each([
    ["another host", "//evil.example/x"],
    ["a full URL", "https://evil.example"],
    ["another scheme", "javascript:alert(1)"],
    ["a backslash", "/\\evil.example"],
    ["just the root", "/"],
    ["the root with a query", "/?projectId=abc123"],
    ["Welcome", "/welcome"],
    ["the code screen", "/phone-code?phone=1"],
    ["the Google callback", "/sign-in/callback#code=x"],
    ["the first run", "/about-you"],
    ["the tour", "/tour"],
    ["the web-only screen", "/web-only"],
    ["the dev index", "/dev"],
    ["something huge", `/${"a".repeat(600)}`],
  ])("refuses %s", (_why, path) => {
    expect(isRememberablePath(path)).toBe(false);
  });

  it("refuses what is not a string", () => {
    expect(isRememberablePath(undefined)).toBe(false);
    expect(isRememberablePath(42)).toBe(false);
  });

  it("does not mistake a page that only starts like a sign-in screen", () => {
    expect(isRememberablePath("/phones-guide")).toBe(true);
    expect(isRememberablePath("/tours")).toBe(true);
  });
});

describe("remembering", () => {
  it("keeps the latest acceptable page until it is forgotten", () => {
    rememberRoute("/room/a/paint");
    rememberRoute("/welcome");
    expect(peekRememberedRoute()).toBe("/room/a/paint");
    rememberRoute("/boards/b");
    expect(peekRememberedRoute()).toBe("/boards/b");
    forgetRememberedRoute();
    expect(peekRememberedRoute()).toBeNull();
  });

  // On a cold start a guard can report its own segment while its redirect is on the way.
  it("keeps the page asked for when only its section is reported after it", () => {
    rememberRoute("/painter/claim/0VkTlzUw5CGJ-bTtxixeiS0nVfg");
    rememberRoute("/painter?token=0VkTlzUw5CGJ-bTtxixeiS0nVfg");
    expect(peekRememberedRoute()).toBe("/painter/claim/0VkTlzUw5CGJ-bTtxixeiS0nVfg");
    rememberRoute("/painter/upload-board?shared=1");
    expect(peekRememberedRoute()).toBe("/painter/upload-board?shared=1");
    // A sibling that merely starts the same way is a new page.
    rememberRoute("/painter/upload-board-guide");
    expect(peekRememberedRoute()).toBe("/painter/upload-board-guide");
    forgetRememberedRoute();
  });
});
