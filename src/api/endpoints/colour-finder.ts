/**
 * /api/colour-finder — a customer's Colour finder: a colour from their photo matched to the
 * nearest HueVistaa shades by Vista code, opened for 24 hours by a pass. Backend:
 * colourfinder/controller/CustomerColourFinderController. Screen: the Colour finder in the
 * Catalogue tab.
 *
 * Nothing about the pass is priced here: the order comes back priced by the server, and only
 * its verification of the payment (or of a Google Play purchase) opens the finder.
 */
import { api } from "../instance";
import type { ColourFinderAccess, ColourFinderPass, ColourFinderPassOrder, VistaShadeMatch } from "../types";
import type { PaymentProof } from "./billing";

export const colourFinderApi = {
  /** Whether it is open to this account, and what 24 hours costs. */
  get: () => api.request<ColourFinderAccess>("api/colour-finder"),

  /** The HueVistaa shades nearest `hex`, closest first. 402 while no pass is running. */
  match: (hex: string, limit = 6) =>
    api.request<VistaShadeMatch[]>("api/colour-finder/match", { query: { hex, limit } }),

  /** An order for 24 hours, for the website's checkout page. Nothing travels: the server prices it. */
  passOrder: () => api.request<ColourFinderPassOrder>("api/colour-finder/pass/order", { method: "POST" }),

  /** Opens the window the order was for, once the signature checks out. Safe to send twice. */
  passVerify: (proof: PaymentProof) =>
    api.request<ColourFinderPass>("api/colour-finder/pass/verify", { body: proof, timeoutMs: 30_000 }),
};
