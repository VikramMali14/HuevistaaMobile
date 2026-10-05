import type { ImageSource } from "expo-image";

import { env } from "@/config/env";

import { tokens } from "./instance";

/**
 * An image the backend serves, ready for expo-image.
 *
 * Absolute links (a presigned S3 URL) are used as they are. A path under /api/ is this
 * server's own file route, which wants the session: it gets the API origin and the
 * Bearer token, the way the website's BFF adds the cookie (lib/media.ts).
 */
export function mediaSource(url: string | null | undefined): ImageSource | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    return isOwnApi(url) ? withToken(url) : { uri: url };
  }
  if (url.startsWith("/")) return withToken(`${env.apiOrigin}${url}`);
  return { uri: url };
}

function isOwnApi(url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === new URL(env.apiOrigin).origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function withToken(uri: string): ImageSource {
  const token = tokens.accessToken;
  // Cached by the address alone. The token changes every few minutes, and keying on it
  // downloaded every picture again each time; one account's pictures are kept from the
  // next by clearing the cache on sign-out and on a switch of profile (auth/session.tsx).
  return token ? { uri, headers: { Authorization: `Bearer ${token}` }, cacheKey: uri } : { uri };
}
