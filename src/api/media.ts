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

/**
 * Fetch a picture's bytes: the backend's own `/api/…` files with the session (refreshed
 * once on a 401, like every other call), anything else as it is. For the studio, which
 * needs the pixels themselves rather than an <Image>.
 */
export async function fetchMedia(url: string, signal?: AbortSignal): Promise<Response> {
  const src = mediaSource(url);
  if (!src?.uri) throw new Error("No picture to fetch");
  const send = (token: string | null) => {
    const headers = token && src.headers ? { Authorization: `Bearer ${token}` } : undefined;
    return fetch(src.uri!, headers || signal ? { ...(headers ? { headers } : {}), ...(signal ? { signal } : {}) } : undefined);
  };
  const used = src.headers ? tokens.accessToken : null;
  let res = await send(used);
  if (res.status === 401 && src.headers && tokens.hasSession()) {
    const current = tokens.accessToken;
    const fresh = current && current !== used ? current : await tokens.refreshOnce();
    if (fresh) res = await send(fresh);
  }
  if (!res.ok) throw new Error(`Picture not available (${res.status})`);
  return res;
}
