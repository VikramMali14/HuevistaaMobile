/**
 * /api/shades/** and the shade-code scheme. Backend: paint/controller/{ShadeController,
 * ShadeCodeSchemeController}. Screens: C3, C19, and every swatch.
 */
import type { ShadeCodeScheme } from "@/lib/shade-codes";
import type { BackendShade } from "@/lib/shade-mapping";

import { api } from "../instance";
import type { ShadeBrandSummary, ShadeDetail } from "../types";

export const shadesApi = {
  /** Every shade this account may see — a shop customer only gets their shop's companies. */
  mine: () => api.request<BackendShade[]>("api/shades/mine", { timeoutMs: 60_000 }),

  myBrands: () => api.request<ShadeBrandSummary[]>("api/shades/mine/brands"),

  /** `code` is the HV code for everyone but an administrator. */
  detail: (brandSlug: string, code: string) =>
    api.request<ShadeDetail>(`api/shades/${encodeURIComponent(brandSlug)}/${encodeURIComponent(code)}`),

  /** How codes and names are shown to this viewer. */
  scheme: () => api.request<ShadeCodeScheme>("api/me/shade-code-scheme"),
};
