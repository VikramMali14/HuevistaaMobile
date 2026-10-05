/**
 * Every cache key in one place, so a change can say exactly what it made stale (a shop
 * code changes the balance, the catalogue and the products at once). The whole cache is
 * cleared on sign-out, so keys need not carry the account.
 */
export const keys = {
  entitlement: ["me", "entitlement"] as const,
  projectOptions: ["me", "project-options"] as const,
  aiCredits: ["me", "ai-credits"] as const,
  projects: ["me", "projects"] as const,
  renders: ["me", "renders"] as const,
  assignedProducts: ["me", "assigned-products"] as const,
  library: ["library"] as const,
  libraryRoom: (slug: string) => ["library", slug] as const,
  catalogue: ["shades", "mine"] as const,
  catalogueCache: ["shades", "mine", "cache"] as const,
  shadeScheme: ["shades", "scheme"] as const,
  shadeDetail: (brand: string, code: string) => ["shades", "detail", brand, code] as const,
};

/**
 * What a redeemed shop code changes. The rooms are read again as well: whether a room is
 * open, and for how long, can depend on the shop behind the account.
 */
export const shopCodeChanges = [
  keys.entitlement,
  keys.projects,
  keys.renders,
  keys.projectOptions,
  keys.aiCredits,
  keys.assignedProducts,
  keys.catalogue,
  keys.shadeScheme,
] as const;
