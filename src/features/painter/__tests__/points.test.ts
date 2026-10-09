import type { PainterWallet, PointsActivity, RewardItem } from "@/api/endpoints/rewards";

import { batchPill, categoriesOf, categoryLabel, claimLanded, expirySentence, expiryWarning, nextReward, points, redemptionStatus, rewardStatus, signedPoints } from "../points";

const NOW = Date.parse("2026-10-05T15:30:00Z"); // 21:00 in India

const item = (code: string, extra: Partial<RewardItem> = {}): RewardItem => ({
  code,
  title: code,
  category: "TOOLS",
  pointsCost: 100,
  stock: null,
  inStock: true,
  affordable: true,
  pointsShort: 0,
  ...extra,
});

const wallet = (extra: Partial<PainterWallet> = {}): Pick<PainterWallet, "nextExpiringPoints" | "nextExpiryAt" | "expiryWarningDays"> => ({
  expiryWarningDays: 10,
  nextExpiringPoints: 120,
  nextExpiryAt: "2026-10-08T21:00:00",
  ...extra,
});

describe("points", () => {
  it("says one point, and groups thousands the Indian way", () => {
    expect(points(1)).toBe("1 point");
    expect(points(-1)).toBe("1 point");
    expect(points(125000)).toBe("1,25,000 points");
    expect(signedPoints(25)).toBe("+25");
    expect(signedPoints(-150)).toBe("−150");
  });

  it("warns about the next batch only inside the warning window", () => {
    expect(expiryWarning(wallet(), NOW)).toEqual({ points: 120, days: 3 });
    expect(expiryWarning(wallet({ nextExpiryAt: "2026-10-30T09:00:00" }), NOW)).toBeNull();
    expect(expiryWarning(wallet({ nextExpiringPoints: 0 }), NOW)).toBeNull();
    expect(expiryWarning(wallet({ nextExpiryAt: null }), NOW)).toBeNull();
    expect(expiryWarning(null, NOW)).toBeNull();
  });

  // An hour left tonight rounds up to a day; it still has to say "today".
  it("says today and tomorrow by the date in India", () => {
    const tonight = expiryWarning(wallet({ nextExpiryAt: "2026-10-05T22:00:00" }), NOW)!;
    expect(expirySentence(tonight)).toBe("120 points expire today. Spending always takes from the batch closest to expiring first.");
    const tomorrow = expiryWarning(wallet({ nextExpiringPoints: 1, nextExpiryAt: "2026-10-06T08:00:00" }), NOW)!;
    expect(expirySentence(tomorrow)).toMatch(/^1 point expires tomorrow\./);
    expect(expirySentence({ points: 40, days: 3 })).toMatch(/^40 points expire in 3 days\./);
  });

  it("labels each batch by its date", () => {
    expect(batchPill("2026-10-05T22:00:00", NOW)).toBe("Today");
    expect(batchPill("2026-10-06T22:00:00", NOW)).toBe("Tomorrow");
    expect(batchPill("2026-10-17T10:00:00", NOW)).toBe("12 days");
    expect(batchPill("not a date", NOW)).toBeNull();
  });
});

describe("rewards", () => {
  it("points at the cheapest reward the balance covers, else the nearest one", () => {
    expect(nextReward([item("A", { pointsCost: 300 }), item("B", { pointsCost: 200 })])?.code).toBe("B");
    expect(
      nextReward([
        item("FAR", { affordable: false, pointsShort: 400 }),
        item("NEAR", { affordable: false, pointsShort: 40 }),
        item("GONE", { inStock: false, affordable: false, pointsShort: 1 }),
      ])?.code,
    ).toBe("NEAR");
    expect(nextReward([item("GONE", { inStock: false })])).toBeNull();
    expect(nextReward(undefined)).toBeNull();
  });

  it("orders categories as the website does, with any new one after", () => {
    expect(categoriesOf([item("a", { category: "VOUCHER" }), item("b", { category: "ZEBRA" }), item("c", { category: "TOOLS" }), item("d", { category: "TOOLS" })])).toEqual([
      "TOOLS",
      "VOUCHER",
      "ZEBRA",
    ]);
    expect(categoryLabel("SITE_KIT")).toBeTruthy();
    expect(categoryLabel("ZEBRA")).toBe("ZEBRA");
  });

  // The website's order: out of stock, then short, then the account, then few left.
  it("says where a reward stands", () => {
    expect(rewardStatus(item("x", { inStock: false, pointsShort: 50 }), true).text).toBe("Out of stock");
    expect(rewardStatus(item("x", { affordable: false, pointsShort: 50 }), false).text).toBe("50 points to go");
    expect(rewardStatus(item("x"), false).text).toBe("Not available on this account");
    expect(rewardStatus(item("x", { stock: 3 }), true)).toEqual({ text: "Only 3 left", tone: "warm" });
    expect(rewardStatus(item("x", { stock: 50 }), true)).toEqual({ text: "Ready to redeem", tone: "accent" });
  });

  it("names redemption statuses, and passes an unknown one through", () => {
    expect(redemptionStatus("REJECTED")).toBe("Refunded");
    expect(redemptionStatus("LOST")).toBe("LOST");
  });
});

describe("claimLanded", () => {
  const asked = Date.parse("2026-10-05T10:00:00Z");
  const row = (extra: Partial<PointsActivity>): PointsActivity => ({ id: "a", points: 25, type: "PROJECT_QR_EARNED", label: "Board", createdAt: "2026-10-05T15:30:10", ...extra });

  // After an answer that never came: did the board pay? Only a board's credit, for that much, since then.
  it("finds the board's credit made since the claim was asked", () => {
    expect(claimLanded({ recentActivity: [row({})] }, 25, asked)).not.toBeNull();
    expect(claimLanded({ recentActivity: [row({ points: 50 })] }, 25, asked)).toBeNull();
    expect(claimLanded({ recentActivity: [row({ type: "PAINTER_REWARD_REFUNDED" })] }, 25, asked)).toBeNull();
    expect(claimLanded({ recentActivity: [row({ createdAt: "2026-10-05T15:20:00" })] }, 25, asked)).toBeNull();
    // A server clock a little behind the phone's still counts.
    expect(claimLanded({ recentActivity: [row({ createdAt: "2026-10-05T15:29:00" })] }, 25, asked)).not.toBeNull();
    expect(claimLanded(undefined, 25, asked)).toBeNull();
  });
});
