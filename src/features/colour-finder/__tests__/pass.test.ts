/**
 * Buying the Colour finder's pass on the website: the same rail as the Shade Book's — the
 * order, the browser session, the server's confirmation — on the finder's own routes, with its
 * own order kept on the phone, and the finder read again once it may have opened. And D3, on a
 * cold start, telling the finder's answer from the Shade Book's and the basket's.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ColourFinderPassOrder } from "@/api/types";
import { latestStart } from "@/features/payments/day-pass";
import { parsePayCallback } from "@/features/payments/pay-link";
import { resetPayments } from "@/features/payments/payments";

import { colourFinderPass } from "../pass";

const mockOpen = jest.fn();
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: (...args: unknown[]) => mockOpen(...args) }));

const mockBilling = { reportCheckout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/billing", () => ({
  get billingApi() {
    return mockBilling;
  },
}));

const mockFinder = { passOrder: jest.fn(), passVerify: jest.fn(), get: jest.fn(), match: jest.fn() };
jest.mock("@/api/endpoints/colour-finder", () => ({
  get colourFinderApi() {
    return mockFinder;
  },
}));

const mockInvalidate = jest.fn(async () => undefined);
jest.mock("@/api/query-client", () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => mockInvalidate(...(args as [])) },
}));

const SIG = "f".repeat(64);
const ORDER: ColourFinderPassOrder = {
  orderId: "order_FINDER1234",
  kind: "CUSTOMER_COLOR_FINDER",
  label: "Colour finder",
  amount: 4900,
  currency: "INR",
  hours: 24,
  razorpayKeyId: "rzp_test_123456",
};
const PASS = {
  kind: "CUSTOMER_COLOR_FINDER" as const,
  label: "Colour finder",
  startsAt: "2026-10-31T10:05:00",
  expiresAt: "2026-11-01T10:05:00",
  amountPaise: 4900,
};
const success = `huevista://pay/callback#status=success&order_id=${ORDER.orderId}&payment_id=pay_FINDER6789&signature=${SIG}`;

beforeEach(async () => {
  mockOpen.mockReset();
  mockFinder.passOrder.mockReset().mockResolvedValue(ORDER);
  mockFinder.passVerify.mockReset().mockResolvedValue(PASS);
  mockBilling.reportCheckout.mockClear();
  mockInvalidate.mockClear();
  resetPayments();
  await AsyncStorage.clear();
});

describe("the Colour finder's pass on the website", () => {
  it("orders on the finder's routes, opens the checkout for the server's ₹49, and confirms it", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });

    const outcome = await colourFinderPass.buyOnWebsite({ name: "Asha" });

    const [url] = mockOpen.mock.calls[0] as [string, string];
    expect(url).toMatch(/order=order_FINDER1234&key=rzp_test_123456&amount=4900&currency=INR/);
    expect(decodeURIComponent(url)).toContain("desc=Colour finder · 24-hour pass");
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(
      ORDER.orderId,
      expect.objectContaining({ status: "OPENED", pageUrl: "huevista://colour-finder" }),
    );
    expect(mockFinder.passVerify).toHaveBeenCalledWith({ orderId: ORDER.orderId, paymentId: "pay_FINDER6789", signature: SIG });
    expect(outcome).toEqual({ kind: "opened", pass: PASS });
    // The finder is read again — not the Shade Book — and nothing is left waiting on the phone.
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["me", "colour-finder"] });
    expect(mockInvalidate).not.toHaveBeenCalledWith({ queryKey: ["me", "shade-book"] });
    expect(await colourFinderPass.kept()).toBeNull();
  });

  it("keeps its order apart from the Shade Book's while the browser is open", async () => {
    let finder: unknown = null;
    let book: string | null = "untouched";
    mockOpen.mockImplementation(async () => {
      finder = await colourFinderPass.kept();
      book = await AsyncStorage.getItem("hv.shadeBookOrder");
      return { type: "success", url: "huevista://pay/callback#status=cancelled" };
    });
    expect(await colourFinderPass.buyOnWebsite()).toEqual({ kind: "cancelled" });
    expect(finder).toEqual(expect.objectContaining({ orderId: ORDER.orderId }));
    expect(book).toBeNull();
  });

  it("puts each outcome in the finder's own words", () => {
    expect(colourFinderPass.noticeFor({ kind: "opened", pass: PASS })).toEqual({
      tone: "success",
      message: expect.stringMatching(/^The Colour finder is open until 1 Nov, 10:05\s?am\.$/),
    });
    expect(colourFinderPass.noticeFor({ kind: "checking", message: "x" })?.message).toMatch(/Colour finder opens by itself.*Don't pay again/);
    expect(colourFinderPass.noticeFor({ kind: "unfinished" })?.message).toMatch(/Colour finder opens by itself/);
  });
});

describe("D3 on a cold start", () => {
  it("knows a success for the finder's order, and nothing else's", async () => {
    await AsyncStorage.setItem("hv.colourFinderOrder", JSON.stringify({ orderId: ORDER.orderId, startedAt: Date.now() }));
    expect(await colourFinderPass.isAnswer(parsePayCallback(success), null)).toBe(ORDER.orderId);
    const other = success.replace(ORDER.orderId, "order_SHADE12345");
    expect(await colourFinderPass.isAnswer(parsePayCallback(other), null)).toBeNull();
  });

  it("takes a cancel only when the finder's checkout was the last one opened", async () => {
    const opened = Date.now() - 60_000;
    await AsyncStorage.setItem("hv.colourFinderOrder", JSON.stringify({ orderId: ORDER.orderId, startedAt: opened }));
    const cancelled = parsePayCallback("huevista://pay/callback#status=cancelled");
    expect(await colourFinderPass.isAnswer(cancelled, null)).toBe(ORDER.orderId);
    // The Shade Book's checkout, or the basket's, opened after it: the cancel is theirs.
    expect(await colourFinderPass.isAnswer(cancelled, latestStart(opened - 5_000, opened + 1_000))).toBeNull();
    expect(await colourFinderPass.isAnswer(cancelled, latestStart(null, opened - 1_000))).toBe(ORDER.orderId);
  });
});

describe("latestStart", () => {
  it("is the latest of the checkouts kept, or nothing when none was", () => {
    expect(latestStart()).toBeNull();
    expect(latestStart(null, undefined)).toBeNull();
    expect(latestStart(5, null, 9, 7)).toBe(9);
  });
});
