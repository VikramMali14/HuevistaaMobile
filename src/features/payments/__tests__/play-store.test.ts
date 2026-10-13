/**
 * The adapter over expo-iap (play/store.ts), against a stand-in for the library: the
 * exact request Google is sent — a wrong name there is dropped without a word, and the
 * purchase reaches Google with no key — and how its purchases and errors are read back.
 */
import { endConnection, fetchProducts, finishTransaction, getAvailablePurchases, requestPurchase } from "../play/store";

// The real adapter here, not jest.setup.ts's double.
jest.unmock("@/features/payments/play/store");
jest.mock("expo-iap", () => ({
  ErrorCode: { UserCancelled: "user-cancelled", AlreadyOwned: "already-owned" },
  isUserCancelledError: (err: { code?: string } | null) => err?.code === "user-cancelled",
  initConnection: jest.fn(async () => true),
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(),
  requestPurchase: jest.fn(),
  getAvailablePurchases: jest.fn(async () => []),
  finishTransaction: jest.fn(async () => undefined),
  purchaseUpdatedListener: jest.fn(() => ({ remove: () => {} })),
  purchaseErrorListener: jest.fn(() => ({ remove: () => {} })),
}));

const iap = jest.requireMock<Record<string, jest.Mock>>("expo-iap");

/** A purchase as expo-iap 5.8.1 hands it back on Android (PurchaseAndroid). */
const NATIVE = {
  id: "GPA.3300-1111-2222-33333",
  transactionId: "GPA.3300-1111-2222-33333",
  productId: "room_1",
  purchaseToken: "opaque.token-1",
  purchaseState: "purchased",
  quantity: 2,
  isAutoRenewing: false,
  store: "google",
  platform: "android",
  transactionDate: 1_760_000_000_000,
  obfuscatedAccountIdAndroid: "acct-43",
  obfuscatedProfileIdAndroid: "intent-1",
};

beforeEach(async () => {
  for (const fn of Object.values(iap)) if (jest.isMockFunction(fn)) fn.mockClear();
  await endConnection();
});

describe("Google Play adapter", () => {
  it("sends exactly the request's own names, and reads the purchase back", async () => {
    iap.requestPurchase!.mockResolvedValue([NATIVE]);
    const outcome = await requestPurchase({ productId: "room_1", obfuscatedAccountId: "acct-43", obfuscatedProfileId: "intent-1" });

    expect(iap.requestPurchase).toHaveBeenCalledWith({
      type: "in-app",
      request: { google: { skus: ["room_1"], obfuscatedAccountId: "acct-43", obfuscatedProfileId: "intent-1" } },
    });
    expect(outcome).toEqual({
      kind: "purchases",
      purchases: [
        {
          token: "opaque.token-1",
          productId: "room_1",
          quantity: 2,
          state: "purchased",
          accountId: "acct-43",
          profileId: "intent-1",
          orderId: "GPA.3300-1111-2222-33333",
          purchasedAt: 1_760_000_000_000,
        },
      ],
    });
  });

  it("turns the sheet's errors into a cancel, an owned pack, or a failure — never a throw", async () => {
    iap.requestPurchase!.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { code: "user-cancelled" }));
    iap.requestPurchase!.mockRejectedValueOnce(Object.assign(new Error("owned"), { code: "already-owned", productId: "room_1" }));
    iap.requestPurchase!.mockRejectedValueOnce(Object.assign(new Error("down"), { code: "service-unavailable" }));
    const ask = () => requestPurchase({ productId: "room_1", obfuscatedAccountId: "a", obfuscatedProfileId: "p" });
    await expect(ask()).resolves.toEqual({ kind: "cancelled" });
    await expect(ask()).resolves.toEqual({ kind: "already-owned", productId: "room_1" });
    await expect(ask()).resolves.toEqual({ kind: "failed", code: "service-unavailable" });
  });

  it("consumes with the library's own purchase", async () => {
    iap.getAvailablePurchases!.mockResolvedValue([NATIVE]);
    const [held] = await getAvailablePurchases();
    await finishTransaction(held!);
    expect(iap.finishTransaction).toHaveBeenCalledWith({ purchase: NATIVE, isConsumable: true });
  });

  it("asks for one-time packs, and leaves out one Google couldn't find", async () => {
    iap.fetchProducts!.mockResolvedValue([
      { id: "room_1", type: "in-app", displayPrice: "₹149.00", productStatusAndroid: "ok" },
      { id: "bundle_3_3", type: "in-app", displayPrice: "", productStatusAndroid: "not-found" },
    ]);
    await expect(fetchProducts(["room_1", "bundle_3_3"])).resolves.toEqual([{ productId: "room_1", displayPrice: "₹149.00" }]);
    expect(iap.fetchProducts).toHaveBeenCalledWith({ skus: ["room_1", "bundle_3_3"], type: "in-app" });
  });
});
