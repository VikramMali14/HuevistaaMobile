/**
 * The app's one API client and its tokens. Screens never import this directly — they go
 * through src/api/endpoints/*.
 */
import { createTokenManager } from "@/auth/token-manager";
import { secureTokenStore } from "@/auth/token-store";
import { env } from "@/config/env";

import { createApiClient, type ApiClient } from "./client";
import { ApiError } from "./errors";
import type { AuthResponse } from "./types";

/** The session's tokens. The refresh call itself never sends a Bearer token. */
export const tokens = createTokenManager({
  store: secureTokenStore,
  async fetchRefresh(refreshToken) {
    const res = await api.request<AuthResponse>("api/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    });
    if (!res.accessToken || !res.refreshToken) {
      throw new ApiError("http", 401, "The refresh answer carried no tokens");
    }
    return { accessToken: res.accessToken, refreshToken: res.refreshToken };
  },
});

export const api: ApiClient = createApiClient({ baseUrl: env.apiOrigin, tokens });
