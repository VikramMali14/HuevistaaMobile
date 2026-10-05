import type { StoredTokens, TokenStore } from "./token-store";

export type { StoredTokens, TokenStore } from "./token-store";

/**
 * The web stand-in for the phone's secure storage (Metro picks this file for web).
 *
 * The app is not shipped on the web — `npm run web` exists so screens can be previewed
 * in a browser while they are built. expo-secure-store has no web implementation, so
 * tokens are kept in memory only: never in localStorage, where any script on the page
 * could read them. A reload signs the browser preview out, which is the safe trade.
 */
let tokens: StoredTokens = { accessToken: null, refreshToken: null };
let deviceToken: string | null = null;

export const secureTokenStore: TokenStore = {
  async read() {
    return { ...tokens };
  },
  async write(accessToken, refreshToken) {
    tokens = { accessToken, refreshToken };
  },
  async clear() {
    tokens = { accessToken: null, refreshToken: null };
  },
  async readDeviceToken() {
    return deviceToken;
  },
  async writeDeviceToken(token) {
    deviceToken = token;
  },
};
