/**
 * Paying for a basket: the order, the browser session, and the answer — verified once,
 * reported to the payment audit, and never called "failed" after Razorpay said paid.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError } from "@/api/errors";
import type { CartOrder } from "@/api/types";

import { payForBasket, paymentState, resetPayments, settlePayment, verifyPayment } from "../payments";
import { peekPending, resetPending } from "../pending-payment";

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
  resetPending();
  await AsyncStorage.clear();
});

describe("payForBasket", () => {
  it("orders, opens the website's checkout, verifies and says what was added", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });
    const state = await payForBasket({ split, accountId: "u1", prefill: { name: "Priya" } });

    expect(mockBilling.cartOrder).toHaveBeenCalledWith(split);
    const [url, redirect] = mockOpen.mock.calls[0] as [string, string];
    expect(url).toMatch(/^https:\/\/huevistaa\.com\/pay\/mobile\?order=order_ABC123xyz&key=rzp_test_123456&amount=29800/);
    expect(redirect).toBe("huevista://pay/callback");
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "OPENED" }));
    expect(mockBilling.verifyCart).toHaveBeenCalledWith({ orderId: ORDER.orderId, paymentId: "pay_DEF456uvw", signature: SIG });
    expect(state).toEqual({ kind: "verified", orderId: ORDER.orderId, paymentId: "pay_DEF456uvw", rooms: 2, credits: 0 });
    // Settled: nothing left waiting on the phone.
    expect(peekPending()).toBeNull();
  });

  it("keeps the order on the phone while the browser is open (for a cold start)", async () => {
    let seen: unknown = null;
    mockOpen.mockImplementation(async () => {
      seen = peekPending();
      return { type: "cancel" };
    });
    await payForBasket({ split, accountId: "u1" });
    expect(seen).toEqual(expect.objectContaining({ accountId: "u1", orderId: ORDER.orderId, amountPaise: 29800, rooms: 2, credits: 0 }));
    expect(JSON.parse((await AsyncStorage.getItem("hv.pendingPayment")) ?? "null")).toBeNull();
  });

  it("treats a browser closed without an answer as cancelled, and reports it", async () => {
    mockOpen.mockResolvedValue({ type: "dismiss" });
    expect(await payForBasket({ split, accountId: "u1" })).toEqual({
      kind: "cancelled",
      orderId: ORDER.orderId,
      basket: { rooms: 2, credits: 0 },
    });
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "ABANDONED" }));
    expect(mockBilling.verifyCart).not.toHaveBeenCalled();
  });

  it("passes the gateway's reason on for a refused payment", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "huevista://pay/callback#status=failed&code=BAD_REQUEST_ERROR&description=Card+declined" });
    expect(await payForBasket({ split, accountId: "u1" })).toEqual(
      expect.objectContaining({ kind: "failed", description: "Card declined", basket: { rooms: 2, credits: 0 } }),
    );
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(
      ORDER.orderId,
      expect.objectContaining({ status: "FAILED", errorCode: "BAD_REQUEST_ERROR", errorDescription: "Card declined" }),
    );
  });

  it("never says failed after a success: an unconfirmed payment is 'checking', and kept", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: success });
    mockBilling.verifyCart.mockRejectedValue(new ApiError("network", 0, "Network error"));
    const state = await payForBasket({ split, accountId: "u1" });

    expect(state.kind).toBe("checking");
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "VERIFY_FAILED", paymentId: "pay_DEF456uvw" }));
    // The proof stays, so it is confirmed later — and the basket can't be paid twice.
    expect(peekPending()).toEqual(expect.objectContaining({ orderId: ORDER.orderId, paid: { paymentId: "pay_DEF456uvw", signature: SIG } }));

    mockBilling.verifyCart.mockResolvedValue({ eligible: true });
    expect((await verifyPayment(ORDER.orderId, "pay_DEF456uvw", SIG)).kind).toBe("verified");
    expect(peekPending()).toBeNull();
  });

  it("throws when the order can't be made — nothing was paid", async () => {
    mockBilling.cartOrder.mockRejectedValue(new ApiError("http", 400, "A quantity cannot be negative."));
    await expect(payForBasket({ split, accountId: "u1" })).rejects.toThrow("A quantity cannot be negative.");
    expect(mockOpen).not.toHaveBeenCalled();
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

  it("keeps a paid one however old, until the server confirms it", async () => {
    await kept({ startedAt: 0, paid: { paymentId: "pay_DEF456uvw", signature: SIG } });
    expect((await (await fresh()).loadPending())?.paid?.paymentId).toBe("pay_DEF456uvw");
  });

  it("keeps a recent unpaid one (the app was stopped mid-payment)", async () => {
    await kept({ startedAt: Date.now() - 60_000 });
    expect((await (await fresh()).loadPending())?.orderId).toBe("order_OLD111aaa");
  });
});
