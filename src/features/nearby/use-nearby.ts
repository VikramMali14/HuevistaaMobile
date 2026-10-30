import { useQuery } from "@tanstack/react-query";

import { isApiError } from "@/api/errors";
import { nearbyApi } from "@/api/endpoints/nearby";
import { keys } from "@/api/query-keys";

import type { SearchPoint } from "./nearby";

/**
 * The searches spend a small shared allowance (60 an hour for both lists together), so
 * they're asked for only on a new point, a new distance or a pull: kept five minutes, not
 * read again when the app comes back, and never tried again on a refusal (429 included) —
 * only once more when no answer came.
 */
const SEARCH = {
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: (failures: number, err: unknown) => failures < 1 && isApiError(err) && err.kind !== "http",
} as const;

export function useNearbyPainters(point: SearchPoint | null, radiusKm: number) {
  return useQuery({
    queryKey: keys.nearbyPainters(point?.lat ?? 0, point?.lon ?? 0, radiusKm),
    queryFn: () => nearbyApi.painters({ lat: point!.lat, lon: point!.lon, radiusKm }),
    enabled: point !== null,
    ...SEARCH,
  });
}

export function useNearbyShops(point: SearchPoint | null, radiusKm: number) {
  return useQuery({
    queryKey: keys.nearbyShops(point?.lat ?? 0, point?.lon ?? 0, radiusKm),
    queryFn: () => nearbyApi.shops({ lat: point!.lat, lon: point!.lon, radiusKm }),
    enabled: point !== null,
    ...SEARCH,
  });
}

/**
 * The names of the places painters say they work in (nearbyApi.workAreas): the same for
 * everybody and seldom changing, so read once a day at most — and a card does without its
 * "Works in" line rather than wait for it.
 */
export function useWorkAreas() {
  return useQuery({
    queryKey: keys.workAreas,
    queryFn: () => nearbyApi.workAreas(),
    staleTime: 24 * 60 * 60_000,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Which place a point is in (nearbyApi.where): "Near …" over a search from the phone's own
 * location, and the state P5 starts a painter's places at. Asked to two decimals — about a
 * kilometre, as much as a place name needs, and all that leaves the phone for it — and kept for
 * the session, since a place doesn't move. Without an answer the screens simply say less.
 */
export function useWhere(point: { lat: number; lon: number } | null) {
  const lat = point ? Math.round(point.lat * 100) / 100 : 0;
  const lon = point ? Math.round(point.lon * 100) / 100 : 0;
  return useQuery({
    queryKey: keys.nearbyWhere(lat, lon),
    queryFn: () => nearbyApi.where(lat, lon),
    enabled: point !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/**
 * A painter's number: asked for only on a press (each one counts against 20 a day, the
 * same painter again included), then kept in memory for the session — a row scrolled
 * away and back, or the other tab and back, never asks again. Cleared on sign-out.
 */
export function usePainterPhone(painterId: string) {
  return useQuery({
    queryKey: keys.nearbyPhone(painterId),
    queryFn: () => nearbyApi.painterPhone(painterId),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    // Offline, fail at once with the reason. A paused ask would wait for the signal, then
    // open the dialler by itself, long after the press.
    networkMode: "always",
  });
}
