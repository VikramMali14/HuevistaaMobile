/** Ported with reward-token.ts from HueVistaaPainter/src/lib/__tests__/reward-token.test.ts. */
import { rewardTokenFrom } from "../reward-token";

const TOKEN = "Ab3_xY9-Qw2ZmKpLrStUvWx";

describe("rewardTokenFrom", () => {
  it("reads the token out of the URL a board's QR encodes", () => {
    expect(rewardTokenFrom(`https://huevistaa.com/r/${TOKEN}`)).toBe(TOKEN);
  });

  /** A preview deployment or a white-label subdomain serves the same board. */
  it("does not care which host served it", () => {
    expect(rewardTokenFrom(`https://sharma.huevistaa.com/r/${TOKEN}`)).toBe(TOKEN);
  });

  it("accepts a bare path", () => {
    expect(rewardTokenFrom(`/r/${TOKEN}`)).toBe(TOKEN);
  });

  /** For the creased board under shop lighting whose QR will not scan. */
  it("accepts the token typed in on its own", () => {
    expect(rewardTokenFrom(TOKEN)).toBe(TOKEN);
  });

  it("trims what a scanner hands back", () => {
    expect(rewardTokenFrom(`  https://huevistaa.com/r/${TOKEN}\n`)).toBe(TOKEN);
  });

  /**
   * The case that matters: a painter points the camera at a paint tin. Rejecting here
   * rather than at the backend is the difference between an instant answer and a round
   * trip that ends in "that code isn't one of ours".
   */
  it.each([
    "https://example.com/some/page",
    "upi://pay?pa=someone@bank",
    "WIFI:S:site-wifi;T:WPA;P:hunter2;;",
    "https://huevistaa.com/home",
    "",
    "   ",
  ])("rejects %j", (input) => {
    expect(rewardTokenFrom(input)).toBeNull();
  });

  it("rejects something far too short to be a token", () => {
    expect(rewardTokenFrom("abc123")).toBeNull();
    expect(rewardTokenFrom("https://huevistaa.com/r/abc")).toBeNull();
  });

  it("rejects a token carrying characters the encoder never emits", () => {
    expect(rewardTokenFrom("Ab3_xY9-Qw2ZmKpLrStU!!!")).toBeNull();
  });
});
