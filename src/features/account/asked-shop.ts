import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * C27 "Ask your shop for another room" emails the shop's owner each time it is sent, so it
 * is sent once a day per account: within a day the screen says it was asked instead.
 */
const KEY = "hv.askedShop";
const DAY_MS = 24 * 60 * 60_000;

export async function askedRecently(accountId: string, now: number = Date.now()): Promise<boolean> {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "null") as { accountId?: string; at?: number } | null;
    return Boolean(stored && stored.accountId === accountId && typeof stored.at === "number" && now - stored.at < DAY_MS);
  } catch {
    return false;
  }
}

export async function rememberAsked(accountId: string, now: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ accountId, at: now })).catch(() => {});
}
