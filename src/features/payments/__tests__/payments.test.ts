/**
 * Paying for a basket: the order, the browser session, and the answer — verified once,
 * reported to the payment audit, and never called "failed" after Razorpay said paid.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError } from "@/api/errors";
import type { CartOrder } from "@/api/types";

import { parsePayCallback } from "../pay-link";
import { deliverPayAnswer, payForBasket, paymentState, PriceChangedError, resetPayments, settlePayment, verifyPayment } from "../payments";
import { clearPending, markPaid, peekPending, pendingIsFor, resetPending, savePending } from "../pending-payment";

const mockOpen = jest.fn();
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: (...args: unknown[]) => mockOpen(...args) }));

const mockBilling = { cartOrder: jest.fn(), verifyCart: jest.fn(), reportCheckout: jest.fn(async () => undefined) };
// Read lazily: the module under test loads this before `mockBilling` exists.
jest.mock("@/api/endpoints/billing", () => ({
  get billingApi() {
    return mockBilling;
  },
}));

const SIG = "f".repeat(64);
const ORDER: CartOrder = {
  orderId: "order_ABC123xyz",
  subtotalPaise: 29800,
  discountPercent: 0,
  discountPaise: 0,
  amountPaise: 29800,
  projectsGranted: 2,
  creditsGranted: 0,
  validDays: 365,
  currency: "INR",
  razorpayKeyId: "rzp_test_123456",
};
const success = `huevista://pay/callback#status=success&order_id=${ORDER.orderId}&payment_id=pay_DEF456uvw&signature=${SIG}`;
const split = { projects: 2, credits: 0, combos: 0, bundles: 0 };

beforeEach(async () => {
  mockOpen.mockReset();
  mockBilling.cartOrder.mockReset().mockResolvedValue(ORDER);
  mockBilling.verifyCart.mockReset().mockResolvedValue({ eligible: true });
  mockBilling.reportCheckout.mockClear();
  resetPayments();
  clearPending();
  await AsyncStorage.clear();
});

const basket = { rooms: 2, credits: 0 };
const pay = (extra: object = {}) => payForBasket({ split, basket, expectedPaise: 29800, accountId: "u1", ...extra });

describe("payForBasket", () => {
  it("orders, opens the website's checkout, verifies and says what was added", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });
    const state = await pay({ prefill: { name: "Priya" } });

    expect(mockBilling.cartOrder).toHaveBeenCalledWith(split);
    const [url, redirect, options] = mockOpen.mock.calls[0] as [string, string, object];
    expect(url).toMatch(/^https:\/\/huevistaa\.com\/pay\/mobile\?order=order_ABC123xyz&key=rzp_test_123456&amount=29800/);
    expect(redirect).toBe("huevista://pay/callback");
    // No "wants to use … to sign in" alert on iOS.
    expect(options).toEqual({ preferEphemeralSession: true });
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "OPENED" }));
    expect(mockBilling.verifyCart).toHaveBeenCalledWith({ orderId: ORDER.orderId, paymentId: "pay_DEF456uvw", signature: SIG });
    expect(state).toEqual({ kind: "verified", orderId: ORDER.orderId, paymentId: "pay_DEF456uvw", rooms: 2, credits: 0 });
    // Settled: nothing left waiting on the phone.
    expect(peekPending()).toBeNull();
  });

  it("keeps the order and what was asked for on the phone while the browser is open (for a cold start)", async () => {
    let seen: unknown = null;
    mockOpen.mockImplementation(async () => {
      seen = peekPending();
      return { type: "success", url: "huevista://pay/callback#status=cancelled" };
    });
    await pay({ basket: { rooms: 1, credits: 1 } });
    expect(seen).toEqual(
      expect.objectContaining({ accountId: "u1", orderId: ORDER.orderId, amountPaise: 29800, rooms: 2, credits: 0, basket: { rooms: 1, credits: 1 } }),
    );
    expect(JSON.parse((await AsyncStorage.getItem("hv.pendingPayment")) ?? "null")).toBeNull();
  });

  it("calls a cancel on the page cancelled, reports it, and puts the basket back as it was asked for", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "huevista://pay/callback#status=cancelled" });
    expect(await pay({ basket: { rooms: 1, credits: 1 } })).toEqual({ kind: "cancelled", orderId: ORDER.orderId, basket: { rooms: 1, credits: 1 } });
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "ABANDONED" }));
    expect(mockBilling.verifyCart).not.toHaveBeenCalled();
  });

  it("never calls a browser closed with no answer cancelled: it may have been paid", async () => {
    mockOpen.mockResolvedValue({ type: "dismiss" });
    expect(await pay()).toEqual({ kind: "unfinished", orderId: ORDER.orderId, basket });
    expect(mockBilling.reportCheckout).not.toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "ABANDONED" }));
    // Kept, so an answer that comes later (D3) can still settle it.
    expect(peekPending()?.orderId).toBe(ORDER.orderId);
  });

  it("takes the page's answer when it arrives just after the browser closed (Android)", async () => {
    mockOpen.mockImplementation(async () => {
      // The session ends as the app comes back; the redirect lands a moment later.
      setTimeout(() => deliverPayAnswer(parsePayCallback(success)), 50);
      return { type: "dismiss" };
    });
    expect((await pay()).kind).toBe("verified");
    expect(mockBilling.verifyCart).toHaveBeenCalledTimes(1);
  });

  it("passes the gateway's reason on for a refused payment", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "huevista://pay/callback#status=failed&code=BAD_REQUEST_ERROR&description=Card+declined" });
    expect(await pay()).toEqual(expect.objectContaining({ kind: "failed", description: "Card declined", basket }));
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(
      ORDER.orderId,
      expect.objectContaining({ status: "FAILED", errorCode: "BAD_REQUEST_ERROR", errorDescription: "Card declined" }),
    );
  });

  it("never says failed after a success: an unconfirmed payment is 'checking', and kept", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });
    mockBilling.verifyCart.mockRejectedValue(new ApiError("network", 0, "Network error"));
    const state = await pay();

    expect(state.kind).toBe("checking");
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "VERIFY_FAILED", paymentId: "pay_DEF456uvw" }));
    // The proof stays, so it is confirmed later — and the basket can't be paid twice.
    expect(peekPending()).toEqual(expect.objectContaining({ orderId: ORDER.orderId, paid: { paymentId: "pay_DEF456uvw", signature: SIG } }));

    // Checking again keeps saying "checking" while it runs (not the bare spinner).
    let finish: (v: unknown) => void = () => {};
    mockBilling.verifyCart.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const again = verifyPayment(ORDER.orderId, "pay_DEF456uvw", SIG);
    expect(paymentState(ORDER.orderId)?.kind).toBe("checking");
    finish({ eligible: true });
    expect((await again).kind).toBe("verified");
    expect(peekPending()).toBeNull();
  });

  it("drops the proof when the server refuses the payment for good, so the basket can be paid", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });
    mockBilling.verifyCart.mockRejectedValue(new ApiError("http", 403, "Payment verification failed."));
    expect(await pay()).toEqual(expect.objectContaining({ kind: "refused", message: "Payment verification failed.", paymentId: "pay_DEF456uvw" }));
    expect(peekPending()).toBeNull();
  });

  it("keeps the proof when the server couldn't reach Razorpay to check it", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });
    mockBilling.verifyCart.mockRejectedValue(new ApiError("http", 403, "Payment verification error."));
    expect((await pay()).kind).toBe("checking");
    expect(peekPending()?.paid?.paymentId).toBe("pay_DEF456uvw");
  });

  it("opens nothing when the order's price isn't the one the basket showed", async () => {
    const err = await pay({ expectedPaise: 19900 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PriceChangedError);
    expect((err as PriceChangedError).amountPaise).toBe(29800);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(peekPending()).toBeNull();
  });

  it("throws when the order can't be made — nothing was paid", async () => {
    mockBilling.cartOrder.mockRejectedValue(new ApiError("http", 400, "A quantity cannot be negative."));
    await expect(pay()).rejects.toThrow("A quantity cannot be negative.");
    expect(mockOpen).not.toHaveBeenCalled();
  });
});

describe("settling an answer", () => {
  it("lets a success win over an earlier cancel of the same order", async () => {
    savePending({ accountId: "u1", orderId: ORDER.orderId, amountPaise: 29800, rooms: 2, credits: 0, startedAt: Date.now() });
    expect((await settlePayment({ status: "cancelled" }, ORDER.orderId, "u1"))?.kind).toBe("cancelled");
    expect((await settlePayment(parsePayCallback(success), ORDER.orderId, "u1"))?.kind).toBe("verified");
  });

  it("never lets a cancel overwrite a payment that went through", async () => {
    mockBilling.verifyCart.mockRejectedValue(new ApiError("network", 0, "Network error"));
    expect((await settlePayment(parsePayCallback(success), ORDER.orderId, "u1"))?.kind).toBe("checking");
    expect((await settlePayment({ status: "cancelled" }, ORDER.orderId, "u1"))?.kind).toBe("checking");
    expect(mockBilling.reportCheckout).not.toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "ABANDONED" }));
  });

  it("checks a kept proof again rather than calling its order cancelled", async () => {
    markPaid(ORDER.orderId, { paymentId: "pay_DEF456uvw", signature: SIG }, "u1");
    expect((await settlePayment({ status: "cancelled" }, ORDER.orderId, "u1"))?.kind).toBe("verified");
    expect(mockBilling.verifyCart).toHaveBeenCalledTimes(1);
  });
});

describe("one verification per payment", () => {
  it("shares it between the browser session and the D3 deep link", async () => {
    let finish: (v: unknown) => void = () => {};
    mockBilling.verifyCart.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const a = verifyPayment(ORDER.orderId, "pay_DEF456uvw", SIG);
    const b = verifyPayment(ORDER.orderId, "pay_DEF456uvw", SIG);
    expect(paymentState(ORDER.orderId)?.kind).toBe("verifying");
    finish({ eligible: true });
    expect(await a).toBe(await b);
    expect(mockBilling.verifyCart).toHaveBeenCalledTimes(1);
  });

  it("settles nothing for an answer that says nothing", async () => {
    expect(await settlePayment({ status: "unknown" }, ORDER.orderId)).toBeNull();
    expect(await settlePayment({ status: "cancelled" }, null)).toBeNull();
  });
});

describe("the payment kept on the phone", () => {
  /** The module as a new run of the app finds it: nothing in memory, only what was stored. */
  const fresh = async () => {
    let mod!: typeof import("../pending-payment");
    jest.isolateModules(() => {
      // A fresh copy is the point here, so it is required inside the isolation.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("../pending-payment");
    });
    return mod;
  };
  const kept = (extra: object) =>
    AsyncStorage.setItem("hv.pendingPayment", JSON.stringify({ accountId: "u1", orderId: "order_OLD111aaa", amountPaise: 100, rooms: 1, credits: 0, ...extra }));

  it("forgets an unpaid order left from hours ago — a checkout walked away from", async () => {
    await kept({ startedAt: Date.now() - 3 * 60 * 60_000 });
    expect(await (await fresh()).loadPending()).toBeNull();
    expect(await AsyncStorage.getItem("hv.pendingPayment")).toBeNull();
  });

  it("keeps a paid one for a week, until the server confirms it", async () => {
    await kept({ startedAt: Date.now() - 6 * 24 * 60 * 60_000, paid: { paymentId: "pay_DEF456uvw", signature: SIG } });
    expect((await (await fresh()).loadPending())?.paid?.paymentId).toBe("pay_DEF456uvw");
  });

  it("lets a paid one go after a week — the server's own webhook has long since settled it", async () => {
    await kept({ startedAt: Date.now() - 8 * 24 * 60 * 60_000, paid: { paymentId: "pay_DEF456uvw", signature: SIG } });
    expect(await (await fresh()).loadPending()).toBeNull();
  });

  it("keeps a recent unpaid one (the app was stopped mid-payment)", async () => {
    await kept({ startedAt: Date.now() - 60_000 });
    expect((await (await fresh()).loadPending())?.orderId).toBe("order_OLD111aaa");
  });
});

describe("whose payment it is", () => {
  it("keeps a paid proof through sign-out, and drops an unpaid order", async () => {
    savePending({ accountId: "u1", orderId: "order_A", amountPaise: 100, rooms: 1, credits: 0, startedAt: Date.now() });
    await resetPending();
    expect(peekPending()).toBeNull();

    savePending({ accountId: "u1", orderId: "order_B", amountPaise: 100, rooms: 1, credits: 0, startedAt: Date.now() });
    markPaid("order_B", { paymentId: "pay_B", signature: SIG });
    await resetPending();
    expect(peekPending()).toEqual(expect.objectContaining({ orderId: "order_B", accountId: "u1", paid: { paymentId: "pay_B", signature: SIG } }));
  });

  it("shows a proof only to its own account — or, kept while signed out, to the next one in", async () => {
    markPaid("order_C", { paymentId: "pay_C", signature: SIG });
    const kept = peekPending();
    expect(kept?.accountId).toBe("");
    expect(pendingIsFor(kept, "u2")).toBe(true);
    expect(pendingIsFor(kept, null)).toBe(false);

    markPaid("order_D", { paymentId: "pay_D", signature: SIG }, "u1");
    expect(pendingIsFor(peekPending(), "u1")).toBe(true);
    expect(pendingIsFor(peekPending(), "u2")).toBe(false);
  });
});
