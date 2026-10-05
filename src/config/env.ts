/**
 * Where the app talks to. EXPO_PUBLIC_* values are built into the app (see .env.example
 * and eas.json), so nothing secret belongs here.
 */

/** Android emulator → the computer it runs on. A real phone needs your LAN IP in .env. */
const DEV_API_ORIGIN = "http://10.0.2.2:8080";
const PROD_API_ORIGIN = "https://api.huevistaa.com";
const PROD_SITE_ORIGIN = "https://huevistaa.com";
const PROD_PAINTER_ORIGIN = "https://painter.huevistaa.com";

function origin(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : undefined;
}

export const env = {
  apiOrigin:
    origin(process.env.EXPO_PUBLIC_API_ORIGIN) ?? (__DEV__ ? DEV_API_ORIGIN : PROD_API_ORIGIN),
  siteOrigin: origin(process.env.EXPO_PUBLIC_SITE_ORIGIN) ?? PROD_SITE_ORIGIN,
  /** The painter website, named on a colour board's reward page (as the website names it). */
  painterOrigin: origin(process.env.EXPO_PUBLIC_PAINTER_ORIGIN) ?? PROD_PAINTER_ORIGIN,
  /**
   * Must match app.json's "scheme", the backend's MOBILE_OAUTH_REDIRECT_URI
   * (huevista://sign-in/callback) and the website's /pay/mobile redirect
   * (huevista://pay/callback).
   */
  scheme: "huevista",
} as const;

export const deepLinks = {
  googleCallback: `${env.scheme}://sign-in/callback`,
  payCallback: `${env.scheme}://pay/callback`,
} as const;
