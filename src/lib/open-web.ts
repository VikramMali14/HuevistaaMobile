import * as WebBrowser from "expo-web-browser";

import { env } from "@/config/env";

/** Website pages the app links to. Opening them keeps legal text always current. */
export const webPages = {
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  refunds: "/legal/refunds",
  about: "/legal/about",
  contact: "/legal/contact",
  forShops: "/for-paint-shops",
  shopDashboard: "/dashboard",
  /** Admin tools; a signed-out browser is sent on to the shops' site to sign in. */
  admin: "/admin",
} as const;

/** Open a page of the website in the in-app browser. */
export async function openWebPage(path: string): Promise<void> {
  const url = /^https?:\/\//.test(path) ? path : `${env.siteOrigin}${path}`;
  try {
    await WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true });
  } catch {
    // The person can still reach the site themselves; nothing on screen depends on this.
  }
}
