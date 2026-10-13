/**
 * Google Play purchases (the Android store build): each one handed to the server once,
 * whichever way it reached the phone; another account's never sent; consumed only once
 * granted; and never called "failed" while the server simply hasn't answered.
 */
import { ApiError } from "@/api/errors";
import { paymentChanges } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { PlayCatalogue, PlayIntent } from "@/api/types";

import { buyPack, reconcilePlay, startPlay, takePurchase } from "../play/play-checkout";
import {
  checkPlayPurchaseAgain,
  classifyPlayError,
  isSettled,
  playPurchaseState,
  rememberPlayAccount,
  resetPlay,
  verifyPlayPurchase,
} from "../play/play-payments";
import type { StoreFailure, StorePurchase } from "../play/store";

const mockBilling = {
  playProducts: jest.fn<Promise<PlayCatalogue>, []>(),
  playIntent: jest.fn<Promise<PlayIntent>, [string]>(),
  playPurchase: jest.fn(),
  reportCheckout: jest.fn(async () => undefined),
};
// Read lazily: the module under test loads this before `mockBilling` exists.
jest.mock("@/api/endpoints/billing", () => ({
  get billingApi() {
    return mockBilling;
  },
}));

/** jest.setup.ts's in-memory Google Play. */
const store = jest.requireMock<{
  initConnection: jest.Mock;
  endConnection: jest.Mock;
  requestPurchase: jest.Mock;
  getAvailablePurchases: jest.Mock;
  finishTransaction: jest.Mock;
  __emitPurchase: (p: StorePurchase) => void;
  __emitError: (f: StoreFailure) => void;
}>("@/features/payments/play/store");

const ME = "me-0123456789abcdefghijklmnopqrstuvwxyzABCD";
const SOMEONE = "someone-else-0123456789abcdefghijklmnopqrst";
/** This account's id under the obfuscation secret the server has since rotated away from. */
const ME_BEFORE = "me-before-rotation-0123456789abcdefghijklmn";
const CATALOGUE: PlayCatalogue = {
  enabled: true,
  eligible: true,
  validDays: 365,
  obfuscatedAccountId: ME,
  products: [{ productId: "room_1", projects: 1, credits: 0 }],
};
const INTENT: PlayIntent = { intentId: "intent-1", productId: "room_1", obfuscatedAccountId: ME, obfuscatedProfileId: "intent-1" };
const purchase = (extra: Partial<StorePurchase> = {}): StorePurchase => ({
  token: "token-1",
  productId: "room_1",
  quantity: 1,
  state: "purchased",
  accountId: ME,
  profileId: "intent-1",
  orderId: "GPA.3300-1111-2222-33333",
  purchasedAt: null,
  ...extra,
});
const GRANTED = { status: "GRANTED", projects: 1, credits: 0, reference: "GPA.3300-1111-2222-33333" };

/** A request that answers only when told to — so three can be in flight at once. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

let stop: (() => void) | null = null;
beforeEach(() => {
  stop?.();
  stop = null;
  resetPlay();
  queryClient.clear();
  for (const fn of Object.values(mockBilling)) fn.mockReset();
  mockBilling.reportCheckout.mockResolvedValue(undefined);
  mockBilling.playProducts.mockResolvedValue(CATALOGUE);
  mockBilling.playIntent.mockResolvedValue(INTENT);
  store.initConnection.mockReset().mockResolvedValue(true);
  store.endConnection.mockReset().mockResolvedValue(undefined);
  store.requestPurchase.mockReset();
  store.getAvailablePurchases.mockReset().mockResolvedValue([]);
  store.finishTransaction.mockReset().mockResolvedValue(undefined);
});

// Nothing left listening, and nothing cached for the next file.
afterAll(() => {
  stop?.();
  queryClient.clear();
});

describe("verifyPlayPurchase", () => {
  it("hands a purchase over, consumes it once granted, and reads the balances again", async () => {
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    mockBilling.playPurchase.mockResolvedValue({ ...GRANTED, projects: 3 });
    rememberPlayAccount(ME);
    const p = purchase({ quantity: 3 });
    const state = await takePurchase(p);

    expect(mockBilling.playPurchase).toHaveBeenCalledWith({ productId: "room_1", purchaseToken: "token-1" });
    expect(state).toEqual({ kind: "granted", token: "token-1", productId: "room_1", rooms: 3, credits: 0, reference: GRANTED.reference });
    await settle();
    expect(store.finishTransaction).toHaveBeenCalledWith(p);
    for (const queryKey of paymentChanges) expect(invalidate).toHaveBeenCalledWith({ queryKey });
    expect(isSettled("token-1")).toBe(true);
    invalidate.mockRestore();
  });

  it("a consume that fails changes nothing: the server consumes it too", async () => {
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    store.finishTransaction.mockRejectedValue(new Error("Item not owned"));
    rememberPlayAccount(ME);
    await expect(takePurchase(purchase())).resolves.toEqual(expect.objectContaining({ kind: "granted" }));
    await settle();
    expect(playPurchaseState("token-1")?.kind).toBe("granted");
  });

  it("202 PENDING: nothing added, and asked about again next time", async () => {
    mockBilling.playPurchase.mockResolvedValue({ status: "PENDING", projects: 0, credits: 0, reference: null });
    const state = await verifyPlayPurchase({ token: "token-1", productId: "room_1" });
    expect(state.kind).toBe("pending");
    expect(isSettled("token-1")).toBe(false);
    expect(store.finishTransaction).not.toHaveBeenCalled();
  });

  it("another account's purchase is said so, settled, and never consumed", async () => {
    mockBilling.playPurchase.mockRejectedValue(new ApiError("http", 409, "This purchase belongs to another account.", undefined, "OTHER_ACCOUNT"));
    rememberPlayAccount(ME);
    const state = await takePurchase(purchase());
    expect(state).toEqual({ kind: "otherAccount", token: "token-1", productId: "room_1" });
    expect(isSettled("token-1")).toBe(true);
    expect(store.finishTransaction).not.toHaveBeenCalled();
  });

  it("a refusal for good gives the server's sentence and its reason", async () => {
    mockBilling.playPurchase.mockRejectedValue(new ApiError("http", 409, "This purchase was refunded.", undefined, "PLAY_REFUSED", "REFUNDED"));
    const state = await verifyPlayPurchase({ token: "token-1", productId: "room_1" });
    expect(state).toEqual({ kind: "refused", token: "token-1", productId: "room_1", message: "This purchase was refunded.", reason: "REFUNDED" });
    expect(isSettled("token-1")).toBe(true);
  });

  it("no answer is checking — never refused — and Check again can still grant it", async () => {
    mockBilling.playPurchase.mockRejectedValueOnce(new ApiError("http", 503, "", undefined, "PLAY_UNAVAILABLE"));
    const first = await verifyPlayPurchase({ token: "token-1", productId: "room_1" });
    expect(first.kind).toBe("checking");
    expect(isSettled("token-1")).toBe(false);
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    await expect(checkPlayPurchaseAgain("token-1")).resolves.toEqual(expect.objectContaining({ kind: "granted" }));
  });

  it.each([
    ["no network", "checking", new ApiError("network", 0, "Network error")],
    ["a timeout", "checking", new ApiError("timeout", 0, "Request timed out")],
    ["a 5xx", "checking", new ApiError("http", 500, "")],
    ["a 401", "checking", new ApiError("http", 401, "")],
    ["a 408", "checking", new ApiError("http", 408, "")],
    ["a 429", "checking", new ApiError("http", 429, "Try again in about 12 minutes")],
    ["OTHER_ACCOUNT", "otherAccount", new ApiError("http", 409, "", undefined, "OTHER_ACCOUNT")],
    ["a bad request", "refused", new ApiError("http", 400, "Unknown product.")],
    ["PLAY_REFUSED", "refused", new ApiError("http", 409, "", undefined, "PLAY_REFUSED", "CANCELLED")],
  ])("%s is %s", (_name, kind, err) => {
    expect(classifyPlayError(err)).toBe(kind);
  });
});

describe("whose purchases are sent", () => {
  it("never sends another account's token, and sends one that carries no account", async () => {
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    rememberPlayAccount(ME);
    expect(takePurchase(purchase({ token: "theirs", accountId: SOMEONE }))).toBeNull();
    await takePurchase(purchase({ token: "promo", accountId: null, profileId: null }));
    expect(mockBilling.playPurchase.mock.calls).toEqual([[{ productId: "room_1", purchaseToken: "promo" }]]);
  });

  it("holds back a purchase carrying an account while this account's id isn't known yet", () => {
    expect(takePurchase(purchase())).toBeNull();
    expect(mockBilling.playPurchase).not.toHaveBeenCalled();
  });

  it("a purchase still pending with Google is noted, not sent", async () => {
    rememberPlayAccount(ME);
    await takePurchase(purchase({ state: "pending" }));
    expect(playPurchaseState("token-1")?.kind).toBe("pending");
    expect(mockBilling.playPurchase).not.toHaveBeenCalled();
  });

  it("a pending purchase can still be asked about by its token — staying pending until the server grants it", async () => {
    rememberPlayAccount(ME);
    const p = purchase({ state: "pending" });
    await takePurchase(p);
    const seen: string[] = [];
    const answer = deferred<unknown>();
    mockBilling.playPurchase.mockReturnValue(answer.promise);
    const asked = checkPlayPurchaseAgain("token-1");
    expect(asked).not.toBeNull();
    seen.push(playPurchaseState("token-1")!.kind);
    // The server granted and consumed it on Google's notification: ALREADY_GRANTED.
    answer.resolve({ ...GRANTED, status: "ALREADY_GRANTED" });
    await expect(asked).resolves.toEqual(expect.objectContaining({ kind: "granted" }));
    expect(seen).toEqual(["pending"]);
    expect(mockBilling.playPurchase).toHaveBeenCalledWith({ productId: "room_1", purchaseToken: "token-1" });
    await settle();
    expect(store.finishTransaction).toHaveBeenCalledWith(p);
  });

  it("a reconcile sends this account's unfinished purchases only, each once", async () => {
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    store.getAvailablePurchases.mockResolvedValue([
      purchase({ token: "mine" }),
      purchase({ token: "theirs", accountId: SOMEONE }),
      purchase({ token: "waiting", state: "pending" }),
    ]);
    await reconcilePlay();
    await reconcilePlay();
    expect(mockBilling.playPurchase.mock.calls).toEqual([[{ productId: "room_1", purchaseToken: "mine" }]]);
    expect(playPurchaseState("theirs")).toBeNull();
    expect(playPurchaseState("waiting")?.kind).toBe("pending");
  });

  it("a purchase stamped before the server rotated its secret is still this account's, and sent", async () => {
    mockBilling.playProducts.mockResolvedValue({ ...CATALOGUE, previousObfuscatedAccountIds: [ME_BEFORE] });
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    store.getAvailablePurchases.mockResolvedValue([
      purchase({ token: "before", accountId: ME_BEFORE }),
      purchase({ token: "theirs", accountId: SOMEONE }),
    ]);
    await reconcilePlay();
    expect(mockBilling.playPurchase.mock.calls).toEqual([[{ productId: "room_1", purchaseToken: "before" }]]);
    expect(playPurchaseState("before")?.kind).toBe("granted");

    // Sign-out forgets the old id with the current one.
    resetPlay();
    rememberPlayAccount(ME);
    expect(takePurchase(purchase({ token: "before-2", accountId: ME_BEFORE }))).toBeNull();
  });

  it("an earlier purchase stamped before a rotation is settled as this account's, not called another's", async () => {
    mockBilling.playIntent.mockResolvedValue({ ...INTENT, previousObfuscatedAccountIds: [ME_BEFORE] });
    mockBilling.playPurchase.mockResolvedValue({ ...GRANTED, status: "ALREADY_GRANTED" });
    store.requestPurchase.mockResolvedValue({ kind: "already-owned", productId: "room_1" });
    store.getAvailablePurchases.mockResolvedValue([purchase({ token: "before", accountId: ME_BEFORE, profileId: "intent-0" })]);
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "added" });
    expect(mockBilling.playPurchase).toHaveBeenCalledWith({ productId: "room_1", purchaseToken: "before" });
    expect(store.requestPurchase).toHaveBeenCalledWith({ productId: "room_1", obfuscatedAccountId: ME, obfuscatedProfileId: "intent-1" });
  });

  it("a reconcile does nothing while Play billing is switched off on the server", async () => {
    mockBilling.playProducts.mockResolvedValue({ enabled: false, eligible: false, validDays: 365, obfuscatedAccountId: null, products: [] });
    await reconcilePlay();
    expect(store.getAvailablePurchases).not.toHaveBeenCalled();
  });
});

describe("buyPack", () => {
  it("asks Google with the intent's two ids, and follows the purchase it hands back", async () => {
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    store.requestPurchase.mockResolvedValue({ kind: "purchases", purchases: [purchase()] });
    const result = await buyPack("room_1");

    expect(mockBilling.playIntent).toHaveBeenCalledWith("room_1");
    expect(store.requestPurchase).toHaveBeenCalledWith({ productId: "room_1", obfuscatedAccountId: ME, obfuscatedProfileId: "intent-1" });
    expect(result).toEqual({ kind: "bought", token: "token-1" });
    await settle();
    expect(playPurchaseState("token-1")?.kind).toBe("granted");
  });

  it("opens nothing when the server won't make an intent", async () => {
    mockBilling.playIntent.mockRejectedValue(new ApiError("http", 503, "", undefined, "PLAY_UNAVAILABLE"));
    await expect(buyPack("room_1")).rejects.toBeInstanceOf(ApiError);
    expect(store.requestPurchase).not.toHaveBeenCalled();
  });

  it("the same purchase from the sheet, Google's listener and a reconcile is sent once", async () => {
    const answer = deferred<unknown>();
    mockBilling.playPurchase.mockReturnValue(answer.promise);
    stop = startPlay();
    await settle();
    store.getAvailablePurchases.mockResolvedValue([purchase()]);
    store.requestPurchase.mockImplementation(async () => {
      store.__emitPurchase(purchase());
      return { kind: "purchases", purchases: [purchase()] };
    });
    const result = await buyPack("room_1");
    const meanwhile = reconcilePlay();
    answer.resolve(GRANTED);
    await meanwhile;
    await reconcilePlay();

    expect(result).toEqual({ kind: "bought", token: "token-1" });
    expect(mockBilling.playPurchase).toHaveBeenCalledTimes(1);
    expect(playPurchaseState("token-1")?.kind).toBe("granted");
  });

  it("a cancel says so once, and reports the intent ABANDONED once — from the sheet and the listener alike", async () => {
    stop = startPlay();
    store.requestPurchase.mockImplementation(async () => {
      store.__emitError({ kind: "cancelled" });
      return { kind: "cancelled" };
    });
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "cancelled" });
    expect(mockBilling.reportCheckout.mock.calls).toEqual([["intent-1", { status: "ABANDONED", pageUrl: "huevista://checkout" }]]);
    expect(mockBilling.playPurchase).not.toHaveBeenCalled();
  });

  // Google answers an attempt on a pack it still holds unfinished with that earlier
  // purchase — on the sheet and on its listener, whoever's it is — and only says
  // "already owned" when it finds none.
  it("Google answers with another account's earlier purchase: said so at once, its token never sent", async () => {
    stop = startPlay();
    await settle();
    const theirs = purchase({ token: "theirs", accountId: SOMEONE, profileId: "their-intent" });
    store.requestPurchase.mockImplementation(async () => {
      store.__emitPurchase(theirs);
      return { kind: "purchases", purchases: [theirs] };
    });
    const started = Date.now();
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "otherAccount" });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(mockBilling.playPurchase).not.toHaveBeenCalled();
  });

  it("Google answers with this account's earlier purchase: settled as owned, never shown as a new payment", async () => {
    stop = startPlay();
    await settle();
    mockBilling.playPurchase.mockResolvedValue({ ...GRANTED, status: "ALREADY_GRANTED" });
    const earlier = purchase({ token: "earlier", profileId: "intent-0" });
    store.requestPurchase.mockImplementation(async () => {
      store.__emitPurchase(earlier);
      return { kind: "purchases", purchases: [earlier] };
    });
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "added" });
    expect(mockBilling.playPurchase.mock.calls).toEqual([[{ productId: "room_1", purchaseToken: "earlier" }]]);
  });

  it("Google answers with this account's earlier purchase still waiting for the money: said so", async () => {
    store.requestPurchase.mockResolvedValue({ kind: "purchases", purchases: [purchase({ token: "earlier", profileId: "intent-0", state: "pending" })] });
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "pending" });
    expect(mockBilling.playPurchase).not.toHaveBeenCalled();
  });

  it("a purchase with no intent on it is this buy's only when it was plainly just made", async () => {
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    store.requestPurchase.mockResolvedValueOnce({
      kind: "purchases",
      purchases: [purchase({ token: "promo", accountId: null, profileId: null, purchasedAt: Date.now() - 30 * 86_400_000 })],
    });
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "added" });
    store.requestPurchase.mockResolvedValueOnce({
      kind: "purchases",
      purchases: [purchase({ token: "new", accountId: null, profileId: null, purchasedAt: Date.now() })],
    });
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "bought", token: "new" });
  });

  it("already owned and granted now: added, and the pack can be bought again", async () => {
    mockBilling.playPurchase.mockResolvedValue({ ...GRANTED, status: "ALREADY_GRANTED" });
    store.requestPurchase.mockResolvedValue({ kind: "already-owned", productId: "room_1" });
    store.getAvailablePurchases.mockResolvedValue([purchase({ token: "earlier", profileId: "intent-0" })]);
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "added" });
    expect(mockBilling.playPurchase).toHaveBeenCalledWith({ productId: "room_1", purchaseToken: "earlier" });
  });

  it("already owned and still pending with Google: said so", async () => {
    mockBilling.playPurchase.mockResolvedValue({ status: "PENDING", projects: 0, credits: 0, reference: null });
    store.requestPurchase.mockResolvedValue({ kind: "already-owned", productId: "room_1" });
    store.getAvailablePurchases.mockResolvedValue([purchase({ token: "earlier" })]);
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "pending" });
  });

  it("already owned by another account on this Google account: said so, its token never sent", async () => {
    store.requestPurchase.mockResolvedValue({ kind: "already-owned", productId: "room_1" });
    store.getAvailablePurchases.mockResolvedValue([purchase({ token: "theirs", accountId: SOMEONE })]);
    await expect(buyPack("room_1")).resolves.toEqual({ kind: "owned", notice: "otherAccount" });
    expect(mockBilling.playPurchase).not.toHaveBeenCalled();
  });
});

describe("startPlay", () => {
  it("an app without Google Play billing (Expo Go) carries on: nothing thrown, nothing listening", async () => {
    const missing = () => {
      throw new Error("Cannot find native module 'ExpoIap'");
    };
    const onPurchase = jest.requireMock<{ onPurchase: jest.Mock }>("@/features/payments/play/store").onPurchase;
    onPurchase.mockImplementationOnce(missing);
    store.initConnection.mockImplementation(async () => missing());
    rememberPlayAccount(ME);

    expect(() => {
      stop = startPlay();
    }).not.toThrow();
    await settle();
    store.__emitPurchase(purchase());
    await settle();
    expect(mockBilling.playPurchase).not.toHaveBeenCalled();
    expect(() => stop?.()).not.toThrow();
    stop = null;
  });
});

describe("resetPlay", () => {
  it("forgets this run's purchases and stops listening", async () => {
    mockBilling.playPurchase.mockResolvedValue(GRANTED);
    rememberPlayAccount(ME);
    stop = startPlay();
    await settle();
    store.__emitPurchase(purchase());
    await settle();
    expect(playPurchaseState("token-1")?.kind).toBe("granted");

    resetPlay();
    expect(playPurchaseState("token-1")).toBeNull();
    store.__emitPurchase(purchase({ token: "token-2", accountId: null }));
    await settle();
    expect(mockBilling.playPurchase).toHaveBeenCalledTimes(1);
  });
});
