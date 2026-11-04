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

/**
 * A page painted on a photo — its own, or another with as many parts: `mini` for the row of
 * houses, `thumb` small, `full` the photo's size.
 */
export function shadeBookPicturePath(
  page: { id: string },
  photo: { id: string; version: string } | undefined,
  size: "mini" | "thumb" | "full",
): string {
  const on = photo ? `&photo=${encodeURIComponent(photo.id)}&v=${encodeURIComponent(photo.version)}` : "";
  return `/api/shade-book/${encodeURIComponent(page.id)}/image?size=${size}${on}`;
}

/** The colour test's four photos, which every server answers on their own address. */
const COLOUR_TEST_PHOTOS = new Set(["interior-2", "interior-3", "exterior-2", "exterior-3"]);

/**
 * A photo as it is, unpainted (public): the colour test's four by their own address, which every
 * server answers; the book's others — the sitting room's two walls, the houses the team added —
 * by the book's.
 */
export function shadeBookPhotoPath(photo: { id: string; version: string }): string {
  const id = encodeURIComponent(photo.id);
  const v = encodeURIComponent(photo.version);
  return COLOUR_TEST_PHOTOS.has(photo.id) ? `/api/colour-test/${id}/photo?v=${v}` : `/api/shade-book/houses/${id}/photo?v=${v}`;
}

/** The picture to keep: the photo over every part's colour and Vista code. Needs the pass. */
export function shadeBookDownloadPath(page: { id: string }, photo?: { id: string }): string {
  return `/api/shade-book/${encodeURIComponent(page.id)}/download${photo ? `?photo=${encodeURIComponent(photo.id)}` : ""}`;
}
