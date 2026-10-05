/**
 * /api/painters/** — the painter's own profile.
 * Backend: painter/controller/PainterController.java. Screens: A10, C33, P5, P12.
 */
import { api } from "../instance";

/** GET/POST /api/painters/me (backend PainterProfileResponse). Fields are added as screens need them. */
export interface PainterProfile {
  userId: string;
  name?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  listedForCustomers?: boolean;
}

export const painterApi = {
  /**
   * Turn this CUSTOMER account into a PAINTER for good. Idempotent for a painter.
   * Refused (403) for shop / distributor / admin accounts, a shop's customer profile,
   * and a customer who already has rooms or a shop's code — the message says why.
   */
  becomePainter: () => api.request<PainterProfile>("api/painters/me", { method: "POST" }),
};
