/**
 * Buying: the customer's counter, its Razorpay orders and their verification, and what
 * happened to a checkout. Backend: billing/controller/{CartController,BillingController,
 * PaymentAttemptController}. Screens: C15 (the board's page cap), C27, C28, C29, D3.
 *
 * Only quantities travel. Every amount is priced again on the server when an order is
 * made, and only a verified signature hands anything over.
 */
import { api } from "../instance";
import type { CartCatalogue, CartOrder, CartSplit, CheckoutEventBody, PdfAllowance } from "../types";

export interface PaymentProof {
  orderId: string;
  paymentId: string;
  signature: string;
}

export const billingApi = {
  /** C28. What is for sale, at what price, and what this account already holds. */
  cart: () => api.request<CartCatalogue>("api/billing/cart"),

  /** C28. The order for a basket; the amount comes back, priced on the server. */
  cartOrder: (split: CartSplit) => api.request<CartOrder>("api/billing/cart/order", { body: split }),

  /**
   * C29/D3. Hands the basket over once the signature checks out. Safe to send twice: a
   * payment the webhook already redeemed for this account answers as a success.
   */
  verifyCart: (proof: PaymentProof) =>
    api.request<CartCatalogue>("api/billing/cart/verify", { body: proof, timeoutMs: 30_000 }),

  /** C15: how many options one board may carry. */
  pdfAllowance: () => api.request<PdfAllowance>("api/billing/pdf-allowance"),

  /**
   * What became of a checkout: opened, closed without paying, refused, or paid and not yet
   * confirmed. Bookkeeping only — it never throws, so it can never fail a payment.
   */
  reportCheckout: async (reference: string, body: CheckoutEventBody): Promise<void> => {
    try {
      await api.request<void>(`api/billing/attempts/${encodeURIComponent(reference)}/events`, { body });
    } catch {
      // A lost report costs a row in the payment audit; a thrown one would cost a sale.
    }
  },
};
