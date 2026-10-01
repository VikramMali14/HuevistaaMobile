import { isApiError } from "@/api/errors";

import type { TokenStore } from "./token-store";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenManagerDeps {
  store: TokenStore;
  /** Trade a refresh token for a new pair (POST /api/auth/refresh). */
  fetchRefresh(refreshToken: string): Promise<TokenPair>;
}

export interface TokenManager {
  /** Read the saved tokens into memory. Call once at start-up. */
  load(): Promise<void>;
  readonly accessToken: string | null;
  hasSession(): boolean;
  setTokens(pair: TokenPair): Promise<void>;
  clear(): Promise<void>;
  /**
   * Refresh the access token — ONCE, however many callers ask at the same moment.
   *
   * The backend rotates the refresh token on every use: the old one dies the moment
   * the new pair is issued. Two requests that both hit a 401 and both refreshed would
   * send the same refresh token twice, the second would be refused, and the person
   * would be signed out for no reason. So every caller shares one in-flight refresh.
   *
   * Resolves to the new access token, or null when the session has ended (the refresh
   * token was refused). A network failure rejects, and keeps the session.
   */
  refreshOnce(): Promise<string | null>;
  /** Called when the backend refuses the refresh token. Returns an unsubscribe. */
  onSessionEnded(listener: () => void): () => void;
}

/** A refused refresh: expired, already used, or never existed. */
function isRefusal(err: unknown): boolean {
  return isApiError(err) && err.kind === "http" && [400, 401, 403].includes(err.status);
}

export function createTokenManager(deps: TokenManagerDeps): TokenManager {
  let access: string | null = null;
  let refresh: string | null = null;
  let inflight: Promise<string | null> | null = null;
  const endedListeners = new Set<() => void>();

  async function setTokens(pair: TokenPair) {
    access = pair.accessToken;
    refresh = pair.refreshToken;
    await deps.store.write(pair.accessToken, pair.refreshToken);
  }

  async function clear() {
    access = null;
    refresh = null;
    await deps.store.clear();
  }

  async function runRefresh(used: string): Promise<string | null> {
    try {
      const pair = await deps.fetchRefresh(used);
      await setTokens(pair);
      return pair.accessToken;
    } catch (err) {
      if (!isRefusal(err)) throw err;
      await clear();
      endedListeners.forEach((listener) => listener());
      return null;
    }
  }

  return {
    async load() {
      const stored = await deps.store.read();
      access = stored.accessToken;
      refresh = stored.refreshToken;
    },
    get accessToken() {
      return access;
    },
    hasSession() {
      return refresh !== null;
    },
    setTokens,
    clear,
    refreshOnce() {
      if (!refresh) return Promise.resolve(null);
      if (!inflight) {
        inflight = runRefresh(refresh).finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
    onSessionEnded(listener) {
      endedListeners.add(listener);
      return () => {
        endedListeners.delete(listener);
      };
    },
  };
}
