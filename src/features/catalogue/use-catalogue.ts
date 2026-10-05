import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { shadesApi } from "@/api/endpoints/shades";
import { keys } from "@/api/query-keys";
import type { ShadeBrandSummary } from "@/api/types";
import { useSession } from "@/auth/session";
import { decodeShades, encodeShades } from "@/lib/shade-codec";
import type { ShadeCodeScheme } from "@/lib/shade-codes";
import { mapToPaintShade } from "@/lib/shade-mapping";
import type { PaintShade } from "@/lib/shade-types";

/** The catalogue as kept on the phone, in the website's compact wire format (~50 bytes a shade). */
export const CATALOGUE_CACHE_KEY = "hv.catalogue";

interface Stored {
  userId: string;
  savedAt: number;
  packed: string;
  brands: ShadeBrandSummary[];
}

export interface Catalogue {
  shades: PaintShade[];
  brands: ShadeBrandSummary[];
}

/** The packed format has no slug; put it back from the brand list. */
function withSlugs(shades: PaintShade[], brands: ShadeBrandSummary[]): PaintShade[] {
  const slugOf = new Map(brands.map((b) => [b.name, b.slug]));
  return shades.map((s) => (s.brandSlug || !slugOf.has(s.brand) ? s : { ...s, brandSlug: slugOf.get(s.brand)! }));
}

async function readStored(userId: string): Promise<Catalogue | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOGUE_CACHE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    // Another account's catalogue is never shown — a shop customer sees only their shop's.
    if (stored.userId !== userId) return null;
    const shades = decodeShades(stored.packed);
    return shades.length ? { shades: withSlugs(shades, stored.brands), brands: stored.brands } : null;
  } catch {
    return null;
  }
}

async function fetchLive(userId: string): Promise<Catalogue> {
  const [rows, brands] = await Promise.all([shadesApi.mine(), shadesApi.myBrands()]);
  const shades = withSlugs(rows.map(mapToPaintShade), brands);
  const stored: Stored = { userId, savedAt: Date.now(), packed: encodeShades(shades), brands };
  await AsyncStorage.setItem(CATALOGUE_CACHE_KEY, JSON.stringify(stored)).catch(() => {});
  return { shades, brands };
}

/**
 * Every shade this account may see (docs/04 C3). Kept on the phone and filtered there:
 * the list changes rarely, filtering on the device is instant, and with the copy kept
 * the catalogue works fully offline. The copy shows at once; the live list replaces it.
 */
export function useCatalogue() {
  const userId = useSession().profile?.id ?? "";
  const stored = useQuery({
    queryKey: keys.catalogueCache,
    queryFn: () => readStored(userId),
    staleTime: Infinity,
    enabled: Boolean(userId),
  });
  const live = useQuery({
    queryKey: keys.catalogue,
    queryFn: () => fetchLive(userId),
    staleTime: 6 * 60 * 60_000,
    enabled: Boolean(userId),
  });
  const data = live.data ?? stored.data ?? null;
  return {
    data,
    /** Nothing to show yet, and still asking. */
    loading: !data && (live.isPending || stored.isPending),
    /** Nothing to show, and the live list failed. */
    error: !data && live.isError ? live.error : null,
    refreshing: live.isFetching && Boolean(data),
    refetch: live.refetch,
  };
}

/** How codes and names are shown to this viewer. A failed read means the safe default. */
export function useShadeScheme(): ShadeCodeScheme {
  const query = useQuery({ queryKey: keys.shadeScheme, queryFn: shadesApi.scheme, staleTime: 60 * 60_000 });
  return query.data ?? {};
}

/** Names are printed only when the scheme allows it AND the shade carries a real one. */
export function shownName(scheme: ShadeCodeScheme, shade: Pick<PaintShade, "name" | "code" | "hvCode">): string | null {
  if (scheme.showNames === false) return null;
  const name = shade.name?.trim();
  if (!name || name === shade.code || name === shade.hvCode) return null;
  return name;
}
