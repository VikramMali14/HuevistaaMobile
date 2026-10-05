/**
 * The signed-in customer's own things: balance, rooms, AI images, shop codes.
 * Backend: account/controller/{CustomerEntitlementController,AccessCodeController},
 * billing/controller/{RewardPointsController,AiCreditController},
 * project/controller/{ProjectController,MyRendersController}. Screens: C1, C5, C27, C30, C31.
 */
import { api } from "../instance";
import type {
  AiCreditSummary,
  AssignedProducts,
  CustomerEntitlement,
  MyRender,
  ProjectPurchaseOptions,
  ProjectSummary,
  RedeemedCode,
  ShopCombo,
} from "../types";

export const meApi = {
  /** Null when no shop is behind this account (the backend answers an empty 200). */
  entitlement: async () =>
    (await api.request<CustomerEntitlement | null | undefined>("api/me/entitlement")) ?? null,

  projectOptions: () => api.request<ProjectPurchaseOptions>("api/billing/points/project-options"),

  aiCredits: () => api.request<AiCreditSummary>("api/billing/ai-credits"),

  projects: () => api.request<ProjectSummary[]>("api/projects"),

  renders: () => api.request<MyRender[]>("api/me/renders"),

  /** C30. Adds the shop's rooms; the rooms and boards already here stay. */
  redeemCode: (code: string) => api.request<RedeemedCode>("api/access-codes/redeem", { body: { code } }),

  /** C12 "Your shop's picks". Empty without a shop. */
  shopCombos: () => api.request<ShopCombo[]>("api/me/retailer-combos"),

  /** C31. */
  assignedProducts: () => api.request<AssignedProducts>("api/me/assigned-products"),
};
