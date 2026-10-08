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
  });
}
