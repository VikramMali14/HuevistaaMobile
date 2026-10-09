import { api } from "../instance";
import type { BackendShade } from "@/lib/shade-mapping";
import type { ShadeCodeScheme } from "@/lib/shade-codes";
import type { ProjectStatus, RoomRegion } from "../types";

/**
 * A room someone shared (D2): public to look at, no sign-in. Withdrawn, expired or gone,
 * every call answers 404 "Share link not found or expired." Copying it into your own rooms
 * needs a session and spends one room — with no request key, so it's never sent twice.
 */

/** GET /api/share/{token} (the public ProjectResponse). */
export interface SharedRoom {
  /** The owner's room id — used only to tell whether the viewer is its owner. */
  id: string;
  name: string;
  status: ProjectStatus;
  /** A signed link (an hour), or the link's own image route. */
  imageUrl: string;
  cleanedImageUrl?: string | null;
  regions: RoomRegion[];
  /** The companies offered; empty means every one. */
  sharedBrands: string[];
  /** Always codes only: no names, no companies printed against a shade. */
  shadeCodeScheme?: ShadeCodeScheme | null;
  /** India's time, no zone. */
  shareExpiresAt?: string | null;
}

export interface SharedBrand {
  name: string;
  slug: string;
  shadeCount: number;
}

export const shareApi = {
  room: (token: string) => api.request<SharedRoom>(`api/share/${encodeURIComponent(token)}`, { auth: false }),

  brands: (token: string) => api.request<SharedBrand[]>(`api/share/${encodeURIComponent(token)}/brands`, { auth: false }),

  /** A whole company at once (it can be thousands), so given longer. */
  shades: (token: string, brandSlug: string) =>
    api.request<BackendShade[]>(`api/share/${encodeURIComponent(token)}/shades`, { auth: false, query: { brand: brandSlug }, timeoutMs: 60_000 }),

  /**
   * A copy into the caller's rooms: the photo and every wall, in the owner's colours. Spends
   * one room. 402 when there's none left (its sentence says what to do), 409 for one's own
   * room (or a clash — retry), 404 once the link has stopped.
   */
  claim: (token: string) => api.request<{ id: string }>(`api/share/${encodeURIComponent(token)}/claim`, { method: "POST" }),

  /** A wall's mask through the link's own route: never expires, works in every storage mode. */
  maskPath: (token: string, regionId: number) => `/api/share/${encodeURIComponent(token)}/regions/${regionId}/mask`,
};
