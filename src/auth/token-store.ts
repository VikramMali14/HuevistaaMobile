import * as SecureStore from "expo-secure-store";

/**
 * Tokens live only in the phone's secure storage (Android Keystore / iOS Keychain) —
 * never in AsyncStorage, logs or crash reports.
 */
const KEYS = {
  access: "hv.access",
  refresh: "hv.refresh",
  /**
   * A shop's "trusted device" token (A8). Kept across sign-outs, like the website, so a
   * shop owner is not asked for an emailed code every time on their own phone.
   */
  device: "hv.device",
} as const;

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export interface TokenStore {
  read(): Promise<StoredTokens>;
  write(accessToken: string, refreshToken: string): Promise<void>;
  clear(): Promise<void>;
  readDeviceToken(): Promise<string | null>;
  writeDeviceToken(token: string): Promise<void>;
}

export const secureTokenStore: TokenStore = {
  async read() {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(KEYS.access),
      SecureStore.getItemAsync(KEYS.refresh),
    ]);
    return { accessToken, refreshToken };
  },
  async write(accessToken, refreshToken) {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.access, accessToken),
      SecureStore.setItemAsync(KEYS.refresh, refreshToken),
    ]);
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.access),
      SecureStore.deleteItemAsync(KEYS.refresh),
    ]);
  },
  readDeviceToken() {
    return SecureStore.getItemAsync(KEYS.device);
  },
  async writeDeviceToken(token) {
    await SecureStore.setItemAsync(KEYS.device, token);
  },
};
