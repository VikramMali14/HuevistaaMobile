import type { CartOrder } from "@/api/types";
import { env } from "@/config/env";
import { t } from "@/i18n";

/** Razorpay ids, as the website's /pay/mobile page checks them. Anything else is not ours. */
const ORDER_ID = /^order_[A-Za-z0-9]{6,32}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,32}$/;
const SIGNATURE = /^[A-Za-z0-9]{16,256}$/;

export type PayCallback =
  | { status: "success"; orderId: string; paymentId: string; signature: string }
  | { status: "cancelled" }
  | { status: "failed"; code?: string; description?: string }
  /** Not a payment answer at all (a link with nothing usable in it). */
  | { status: "unknown" };

/**
 * What the website's /pay/mobile page handed back on huevista://pay/callback#… — read from
 * the fragment (never logged, never sent on), and parsed, never trusted: a success is only
 * believed once the server has verified its signature (C29). The fragment's names are the
 * page's (`order_id`, `payment_id`, `signature`); the backend's are camel-cased.
 */
export function parsePayCallback(url: string | null | undefined): PayCallback {
  if (!url) return { status: "unknown" };
  const hashAt = url.indexOf("#");
  if (hashAt < 0) return { status: "unknown" };
  const params: Record<string, string> = {};
  for (const part of url.slice(hashAt + 1).split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    try {
      params[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    } catch {
      // A broken escape: leave that field out.
    }
  }
  switch (params.status) {
    case "success": {
      const { order_id: orderId = "", payment_id: paymentId = "", signature = "" } = params;
      if (!ORDER_ID.test(orderId) || !PAYMENT_ID.test(paymentId) || !SIGNATURE.test(signature)) return { status: "unknown" };
      return { status: "success", orderId, paymentId, signature };
    }
    case "cancelled":
      return { status: "cancelled" };
    case "failed":
      return {
        status: "failed",
        code: params.code?.slice(0, 128) || undefined,
        description: params.description?.trim().slice(0, 300) || undefined,
      };
    default:
      return { status: "unknown" };
  }
}

/** "2 rooms + 3 AI credits" — what the order hands over, for Checkout and the bank statement. */
export function describeOrder(order: Pick<CartOrder, "projectsGranted" | "creditsGranted">): string {
  const parts: string[] = [];
  if (order.projectsGranted > 0) {
    parts.push(order.projectsGranted === 1 ? t("checkout.oneRoom") : t("checkout.rooms", { n: order.projectsGranted }));
  }
  if (order.creditsGranted > 0) {
    parts.push(order.creditsGranted === 1 ? t("checkout.oneCredit") : t("checkout.credits", { n: order.creditsGranted }));
  }
  return parts.join(" + ") || t("common.appName");
}

export interface Prefill {
  name?: string | null;
  email?: string | null;
  contact?: string | null;
}

/**
 * The website page that runs Razorpay Checkout for the app (07 "Payments"). It holds only
 * what Razorpay would see anyway — the public key, the order, the amount to display — and
 * hands the outcome back to a redirect it does not take from this link.
 */
export function checkoutUrl(order: Pick<CartOrder, "orderId" | "razorpayKeyId" | "amountPaise" | "currency">, desc: string, prefill: Prefill = {}): string {
  const q: [string, string][] = [
    ["order", order.orderId],
    ["key", order.razorpayKeyId],
    ["amount", String(order.amountPaise)],
    ["currency", order.currency || "INR"],
    ["desc", desc],
  ];
  if (prefill.name?.trim()) q.push(["name", prefill.name.trim()]);
  if (prefill.email?.trim()) q.push(["email", prefill.email.trim()]);
  if (prefill.contact?.trim()) q.push(["contact", prefill.contact.trim()]);
  return `${env.siteOrigin}/pay/mobile?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
