import * as Sentry from "@sentry/react-native";
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";
import { Platform } from "react-native";

import { env } from "@/config/env";

/**
 * Crash reports (Phase 8), through Sentry: what went wrong, on which screen, on which
 * phone and version — and the account's internal id, so a problem someone tells support
 * about can be found. Never a name, email, phone number, photo, token or code: the SDK
 * is told not to send personal data, takes no screenshots, and every event and
 * breadcrumb is scrubbed below before it leaves the phone. Off without a DSN, on the
 * web, and in development.
 */
let on = false;

export function startCrashReports(): void {
  if (on || !env.sentryDsn || Platform.OS === "web" || __DEV__) return;
  Sentry.init({
    dsn: env.sentryDsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Crash-free sessions per version; no performance tracing.
    enableAutoSessionTracking: true,
    tracesSampleRate: 0,
    maxBreadcrumbs: 50,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  on = true;
}

/** An error worth knowing about that the app caught and carried on from. */
export function reportError(error: unknown, where: string): void {
  if (on) Sentry.captureException(error, { tags: { where } });
}

/** The signed-in account's internal id only — or none. */
export function setCrashUser(id: string | null): void {
  if (on) Sentry.setUser(id ? { id } : null);
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// +91 98765 43210, 9876543210, 098765-43210 …
const PHONE = /(?:\+?\d[\d\s-]{8,}\d)/g;
const PUSH_TOKEN = /Expo(?:nent)?PushToken\[[^\]]*\]/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
// A path segment long enough to be an id or a code: board and share codes, room ids, tokens.
const LONG_SEGMENT = /\/[A-Za-z0-9_-]{16,}(?=\/|$)/g;

/** A sentence with anything personal or secret taken out. */
export function scrubText(text: string): string {
  return text
    .replace(PUSH_TOKEN, "[push token]")
    .replace(BEARER, "Bearer [token]")
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[number]");
}

/** An address without its query, fragment or ids: "https://api.huevistaa.com/api/share/:id". */
export function scrubUrl(url: string): string {
  const bare = url.split(/[?#]/)[0] ?? "";
  return scrubText(bare.replace(LONG_SEGMENT, "/:id"));
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = { url: event.request.url ? scrubUrl(event.request.url) : undefined, method: event.request.method };
  }
  event.user = event.user?.id ? { id: event.user.id } : undefined;
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b): b is Breadcrumb => b !== null);
  delete event.extra;
  return event;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // What was typed is nobody's business.
  if (crumb.category === "ui.input") return null;
  const out: Breadcrumb = { ...crumb };
  if (out.message) out.message = scrubText(out.message);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out.data)) {
      if (key === "url" || key === "from" || key === "to") data[key] = typeof value === "string" ? scrubUrl(value) : value;
      else if (key === "method" || key === "status_code") data[key] = value;
      // Bodies, headers, params: dropped.
    }
    out.data = data;
  }
  return out;
}
