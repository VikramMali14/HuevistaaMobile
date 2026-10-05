/**
 * Every cache key in one place, so a change can say exactly what it made stale (a shop
 * code changes the balance, the catalogue and the products at once). The whole cache is
 * cleared on sign-out and on a switch of profile, so keys need not carry the account.
 */
export const keys = {
  entitlement: ["me", "entitlement"] as const,
  projectOptions: ["me", "project-options"] as const,
  aiCredits: ["me", "ai-credits"] as const,
  projects: ["me", "projects"] as const,
  renders: ["me", "renders"] as const,
  assignedProducts: ["me", "assigned-products"] as const,
  shopCombos: ["me", "shop-combos"] as const,
  library: ["library"] as const,
  libraryRoom: (slug: string) => ["library", slug] as const,
  catalogue: ["shades", "mine"] as const,
  catalogueCache: ["shades", "mine", "cache"] as const,
  shadeScheme: ["shades", "scheme"] as const,
  shadeDetail: (brand: string, code: string) => ["shades", "detail", brand, code] as const,
  /** One room with its walls. Under "me", "projects" so a change to the list reaches it. */
  room: (id: string) => ["me", "projects", id] as const,
  roomReport: (id: string) => ["me", "projects", id, "report"] as const,
  suggestions: (id: string, round: number) => ["me", "projects", id, "suggestions", round] as const,
};

/**
 * What a redeemed shop code changes. The rooms are read again as well: whether a room is
 * open, and for how long, can depend on the shop behind the account.
 *
 * `shopCodeBalance` is what the next screen needs right away (the "Start a room" button
 * after a code leads straight to spending one) and is waited for; the rest reloads behind
 * it — the catalogue alone can take many seconds on a slow connection.
 */
export const shopCodeBalance = [keys.entitlement, keys.projectOptions, keys.aiCredits, keys.projects] as const;
export const shopCodeChanges = [
  ...shopCodeBalance,
  keys.renders,
  keys.assignedProducts,
  keys.shopCombos,
  keys.catalogue,
  keys.shadeScheme,
] as const;
