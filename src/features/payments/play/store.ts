import {
  endConnection as iapEndConnection,
  ErrorCode,
  fetchProducts as iapFetchProducts,
  finishTransaction as iapFinishTransaction,
  getAvailablePurchases as iapGetAvailablePurchases,
  initConnection as iapInitConnection,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase as iapRequestPurchase,
  type Product,
  type Purchase,
} from "expo-iap";

/**
 * Google Play Billing, through expo-iap — the only file that imports it. Everything else
 * sees the app's own shapes below, so the library's names never spread through the app
 * and Jest replaces this one module (jest.setup.ts).
 *
 * Nothing here decides what was bought: a purchase only becomes rooms or credits once the
 * server has read it from Google (play-payments.ts). Purchases are never logged — a
 * purchase token is as good as the purchase.
 */

/** Google's word for a purchase: only "purchased" is ever sent to the server. */
export type StorePurchaseState = "pending" | "purchased" | "unknown";

/** A purchase as Google handed it to the phone. */
export interface StorePurchase {
  /** What the server reads the purchase by. Null: nothing can be done with it. */
  token: string | null;
  productId: string;
  quantity: number;
  state: StorePurchaseState;
  /** The account id it was bought under — set by this app on every purchase it starts. */
  accountId: string | null;
  /** The intent it was bought under (the server's obfuscatedProfileId). */
  profileId: string | null;
  /** Google's order id when the store gives one ("GPA.…"), for a person asking for help. */
  orderId: string | null;
  /** When it was bought (ms), by Google's clock: tells a new purchase from one held earlier. */
  purchasedAt: number | null;
}

/** A pack as Google prices it, in the buyer's own currency. */
export interface StoreProduct {
  productId: string;
  displayPrice: string;
}

/** Why a purchase didn't happen. */
export type StoreFailure =
  | { kind: "cancelled" }
  /** Google holds an earlier purchase of this pack that hasn't been consumed yet. */
  | { kind: "already-owned"; productId: string | null }
  | { kind: "failed"; code: string | null };

/**
 * What asking for a purchase came back with. Never thrown: every way it ends is here. When
 * Google already holds an unfinished purchase of the pack, the library looks it up and
 * answers with it as if it had just been bought (whoever it belongs to), and only reports
 * "already-owned" when it finds none — so the purchases here aren't always this buy's.
 */
export type BuyOutcome = { kind: "purchases"; purchases: StorePurchase[] } | StoreFailure;

export interface BuyRequest {
  productId: string;
  obfuscatedAccountId: string;
  obfuscatedProfileId: string;
}

/**
 * The library's own purchase behind each token, for finishTransaction (it wants the
 * object it gave). Forgotten when the connection ends.
 */
const natives = new Map<string, Purchase>();

function fromNative(p: Purchase): StorePurchase {
  const token = p.purchaseToken ?? null;
  if (token) natives.set(token, p);
  // The obfuscated ids come back under Android-suffixed names, only on Android purchases.
  const android = "obfuscatedAccountIdAndroid" in p ? p : null;
  return {
    token,
    productId: p.productId,
    quantity: p.quantity,
    state: p.purchaseState,
    accountId: android?.obfuscatedAccountIdAndroid ?? null,
    profileId: android?.obfuscatedProfileIdAndroid ?? null,
    orderId: ("transactionId" in p ? p.transactionId : null) ?? null,
    purchasedAt: typeof p.transactionDate === "number" ? p.transactionDate : null,
  };
}

function failureFrom(err: unknown): StoreFailure {
  const code = (err as { code?: unknown } | null)?.code;
  if (isUserCancelledError(err) || code === ErrorCode.UserCancelled) return { kind: "cancelled" };
  if (code === ErrorCode.AlreadyOwned) {
    const productId = (err as { productId?: unknown }).productId;
    return { kind: "already-owned", productId: typeof productId === "string" ? productId : null };
  }
  return { kind: "failed", code: typeof code === "string" ? code : null };
}

export async function initConnection(): Promise<boolean> {
  return iapInitConnection();
}

export async function endConnection(): Promise<void> {
  natives.clear();
  await iapEndConnection();
}

/** Google's prices for these packs. A pack Play doesn't know is left out. */
export async function fetchProducts(productIds: string[]): Promise<StoreProduct[]> {
  if (productIds.length === 0) return [];
  const found = (await iapFetchProducts({ skus: productIds, type: "in-app" })) ?? [];
  const wanted = new Set(productIds);
  return (found as Product[])
    .filter((p) => p.type === "in-app" && wanted.has(p.id))
    // Play Billing 8+ may return a pack it couldn't find, flagged; only "ok" ones are for sale.
    .filter((p) => !("productStatusAndroid" in p) || !p.productStatusAndroid || p.productStatusAndroid === "ok")
    .map((p) => ({ productId: p.id, displayPrice: p.displayPrice }));
}

/**
 * Google's purchase sheet for one pack, carrying both server-issued ids. The names are
 * the request's own (`obfuscatedAccountId`, `obfuscatedProfileId`): the Android-suffixed
 * ones exist only on the purchase read back, and a wrong name is dropped without a word —
 * the purchase would reach Google with no key at all. The buyer chooses how many in
 * Google's sheet; the request has no quantity.
 */
export async function requestPurchase({ productId, obfuscatedAccountId, obfuscatedProfileId }: BuyRequest): Promise<BuyOutcome> {
  try {
    const result = await iapRequestPurchase({
      type: "in-app",
      request: { google: { skus: [productId], obfuscatedAccountId, obfuscatedProfileId } },
    });
    const list = result == null ? [] : Array.isArray(result) ? result : [result];
    return { kind: "purchases", purchases: list.map(fromNative) };
  } catch (err) {
    return failureFrom(err);
  }
}

/** Purchases Google still holds unfinished on this phone: pending, or not yet consumed. */
export async function getAvailablePurchases(): Promise<StorePurchase[]> {
  return (await iapGetAvailablePurchases()).map(fromNative);
}

/**
 * Consume a purchase the server has granted, so the pack can be bought again. The server
 * consumes it too; whichever is first wins, and the other's failure means nothing.
 */
export async function finishTransaction(purchase: StorePurchase): Promise<void> {
  const native = purchase.token ? natives.get(purchase.token) : undefined;
  if (!native) throw new Error("No purchase to finish");
  await iapFinishTransaction({ purchase: native, isConsumable: true });
}

/** Every purchase Google reports, whoever started it (a pending one finishing included). */
export function onPurchase(listener: (purchase: StorePurchase) => void): { remove: () => void } {
  return purchaseUpdatedListener((p) => listener(fromNative(p)));
}

/** Every purchase that didn't happen — the sheet's cancel arrives here as well as on the request. */
export function onError(listener: (failure: StoreFailure) => void): { remove: () => void } {
  return purchaseErrorListener((err) => listener(failureFrom(err)));
}
