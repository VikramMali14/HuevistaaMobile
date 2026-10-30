/**
 * Buying the Shade Book's pass on the website: the order, the browser session the basket
 * uses too, and the answer — confirmed by the server, reported to the payment audit, and
 * never called "failed" once Razorpay said paid. And D3, on a cold start, knowing the pass's
 * answer from the basket's.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError } from "@/api/errors";
import type { ShadeBookPassOrder } from "@/api/types";
import { parsePayCallback } from "@/features/payments/pay-link";
import { checkoutInProgress, deliverPayAnswer, resetPayments } from "@/features/payments/payments";

import { buyPassOnWebsite, forgetPassOrder, isPassAnswer, keptPassOrder, noticeFor, settlePassAnswer } from "../pass";

const mockOpen = jest.fn();
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: (...args: unknown[]) => mockOpen(...args) }));

const mockBilling = { reportCheckout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/billing", () => ({
  get billingApi() {
    return mockBilling;
  },
}));

const mockBook = { passOrder: jest.fn(), passVerify: jest.fn(), get: jest.fn() };
jest.mock("@/api/endpoints/shade-book", () => ({
  get shadeBookApi() {
    return mockBook;
  },
}));

const mockInvalidate = jest.fn(async () => undefined);
jest.mock("@/api/query-client", () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => mockInvalidate(...(args as [])) },
}));

const SIG = "e".repeat(64);
const ORDER: ShadeBookPassOrder = {
  orderId: "order_SHADE12345",
  kind: "SHADE_BOOK",
  label: "Shade Book",
  amount: 4900,
  currency: "INR",
  hours: 24,
  razorpayKeyId: "rzp_test_123456",
};
const PASS = { kind: "SHADE_BOOK" as const, label: "Shade Book", startsAt: "2026-10-30T16:05:00", expiresAt: "2026-10-31T16:05:00", amountPaise: 4900 };
const success = `huevista://pay/callback#status=success&order_id=${ORDER.orderId}&payment_id=pay_SHADE6789&signature=${SIG}`;

beforeEach(async () => {
  mockOpen.mockReset();
  mockBook.passOrder.mockReset().mockResolvedValue(ORDER);
  mockBook.passVerify.mockReset().mockResolvedValue(PASS);
  mockBilling.reportCheckout.mockClear();
  mockInvalidate.mockClear();
  resetPayments();
  await AsyncStorage.clear();
});

describe("buyPassOnWebsite", () => {
  it("orders, opens the website's checkout for the server's amount, and confirms the payment", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });

    const outcome = await buyPassOnWebsite({ name: "Asha" });

    const [url, redirect] = mockOpen.mock.calls[0] as [string, string];
    expect(url).toMatch(/^https:\/\/huevistaa\.com\/pay\/mobile\?order=order_SHADE12345&key=rzp_test_123456&amount=4900&currency=INR/);
    expect(decodeURIComponent(url)).toContain("desc=Shade Book · 24-hour pass");
    expect(url).toContain("name=Asha");
    expect(redirect).toBe("huevista://pay/callback");
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "OPENED" }));
    expect(mockBook.passVerify).toHaveBeenCalledWith({ orderId: ORDER.orderId, paymentId: "pay_SHADE6789", signature: SIG });
    expect(outcome).toEqual({ kind: "opened", pass: PASS });
    // The book is read again, and nothing is left waiting on the phone.
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["me", "shade-book"] });
    expect(await keptPassOrder()).toBeNull();
  });

  it("keeps the order on the phone while the browser is open, and counts as the checkout in progress", async () => {
    let kept: unknown = null;
    let inProgress = false;
    mockOpen.mockImplementation(async () => {
      kept = await keptPassOrder();
      inProgress = checkoutInProgress();
      return { type: "success", url: "huevista://pay/callback#status=cancelled" };
    });
    await buyPassOnWebsite();
    expect(kept).toEqual(expect.objectContaining({ orderId: ORDER.orderId }));
    expect(inProgress).toBe(true);
    expect(checkoutInProgress()).toBe(false);
  });

  it("takes an answer D3 hands over while the session is open", async () => {
    mockOpen.mockImplementation(async () => {
      deliverPayAnswer(parsePayCallback(success));
      return { type: "dismiss" };
    });
    expect(await buyPassOnWebsite()).toEqual({ kind: "opened", pass: PASS });
  });

  it("throws before anything opens when the order is refused", async () => {
    mockBook.passOrder.mockRejectedValue(new ApiError("http", 409, "Online payment is not configured."));
    await expect(buyPassOnWebsite()).rejects.toThrow("Online payment is not configured.");
    expect(mockOpen).not.toHaveBeenCalled();
  });
});

describe("settlePassAnswer", () => {
  it("never says failed after Razorpay said paid: a confirmation that didn't get through is checking", async () => {
    mockBook.passVerify.mockRejectedValue(new ApiError("network", 0, "No connection"));
    const outcome = await settlePassAnswer(parsePayCallback(success), ORDER.orderId);
    expect(outcome.kind).toBe("checking");
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "VERIFY_FAILED", paymentId: "pay_SHADE6789" }));
    // The webhook may have opened it meanwhile.
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["me", "shade-book"] });
  });

  it("says the server's reason when it refuses the payment for good", async () => {
    mockBook.passVerify.mockRejectedValue(new ApiError("http", 403, "Payment verification failed."));
    expect(await settlePassAnswer(parsePayCallback(success), ORDER.orderId)).toEqual({ kind: "refused", message: "Payment verification failed." });
  });

  it("reports a cancel and a refused card, and a browser closed with no answer as not known", async () => {
    expect(await settlePassAnswer(parsePayCallback("huevista://pay/callback#status=cancelled"), ORDER.orderId)).toEqual({ kind: "cancelled" });
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "ABANDONED" }));
    expect(await settlePassAnswer(parsePayCallback("huevista://pay/callback#status=failed&code=BAD_REQUEST_ERROR&description=Card%20declined"), ORDER.orderId)).toEqual({
      kind: "failed",
      description: "Card declined",
    });
    expect(await settlePassAnswer(null, ORDER.orderId)).toEqual({ kind: "unfinished" });
  });

  it("puts each outcome in words", () => {
    expect(noticeFor({ kind: "opened", pass: PASS })).toEqual({ tone: "success", message: expect.stringMatching(/open until 31 Oct, 4:05\s?pm/) });
    expect(noticeFor({ kind: "checking", message: "x" })?.message).toMatch(/Don't pay again/);
    expect(noticeFor({ kind: "cancelled" })?.message).toMatch(/Nothing was charged/);
  });
});

describe("isPassAnswer (D3 on a cold start)", () => {
  it("knows a success for the pass's order, and nothing else's", async () => {
    mockOpen.mockImplementation(async () => {
      // Android stopped the app here: the order stays kept.
      throw new Error("killed");
    });
    await expect(buyPassOnWebsite()).rejects.toThrow("killed");
    expect(await isPassAnswer(parsePayCallback(success), null)).toBe(ORDER.orderId);
    const other = success.replace(ORDER.orderId, "order_BASKET1234");
    expect(await isPassAnswer(parsePayCallback(other), null)).toBeNull();
  });

  it("takes a cancel for the pass's only when its checkout was opened after the basket's", async () => {
    const opened = Date.now() - 60_000;
    await AsyncStorage.setItem("hv.shadeBookOrder", JSON.stringify({ orderId: ORDER.orderId, startedAt: opened }));
    const cancelled = parsePayCallback("huevista://pay/callback#status=cancelled");
    expect(await isPassAnswer(cancelled, null)).toBe(ORDER.orderId);
    expect(await isPassAnswer(cancelled, opened - 1_000)).toBe(ORDER.orderId);
    expect(await isPassAnswer(cancelled, opened + 1_000)).toBeNull();
  });

  it("forgets an order once settled, or long walked away from", async () => {
    await AsyncStorage.setItem("hv.shadeBookOrder", JSON.stringify({ orderId: ORDER.orderId, startedAt: Date.now() - 3 * 60 * 60_000 }));
    expect(await keptPassOrder()).toBeNull();
    await AsyncStorage.setItem("hv.shadeBookOrder", JSON.stringify({ orderId: ORDER.orderId, startedAt: Date.now() }));
    await forgetPassOrder();
    expect(await keptPassOrder()).toBeNull();
  });
});
