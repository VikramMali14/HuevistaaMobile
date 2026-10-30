/**
 * /api/shade-book — colour combinations of our shades painted on real houses, opened for 24
 * hours by a pass. Backend: shadebook/controller/ShadeBookController. Screens: the Shade
 * Book tab and one page of it.
 *
 * Nothing about the pass is priced here: the order comes back priced by the server, and only
 * its verification of the payment (or of a Google Play purchase) opens the book.
 */
import { api } from "../instance";
import type { ShadeBook, ShadeBookPass, ShadeBookPassOrder } from "../types";
import type { PaymentProof } from "./billing";

export const shadeBookApi = {
  /** Every page while the pass runs, the free samples when it doesn't. */
  get: () => api.request<ShadeBook>("api/shade-book"),

  /** An order for 24 hours, for the website's checkout page. Nothing travels: the server prices it. */
  passOrder: () => api.request<ShadeBookPassOrder>("api/shade-book/pass/order", { method: "POST" }),

  /** Opens the window the order was for, once the signature checks out. Safe to send twice. */
  passVerify: (proof: PaymentProof) =>
    api.request<ShadeBookPass>("api/shade-book/pass/verify", { body: proof, timeoutMs: 30_000 }),
};

/** A page painted on its photo: `thumb` for the list, `full` for a page on its own. */
export function shadeBookPicturePath(page: { id: string }, version: string | null | undefined, size: "thumb" | "full"): string {
  return `/api/shade-book/${encodeURIComponent(page.id)}/image?size=${size}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
}

/** The picture to keep: the house over every part's colour and Vista code. Needs the pass. */
export function shadeBookDownloadPath(page: { id: string }): string {
  return `/api/shade-book/${encodeURIComponent(page.id)}/download`;
}
