import { useQuery } from "@tanstack/react-query";

import { isApiError } from "@/api/errors";
import { painterApi } from "@/api/endpoints/painter";
import { rewardsApi } from "@/api/endpoints/rewards";
import { keys } from "@/api/query-keys";

/** The painter's points: balance, batches and statement (P1, P2, P4, P9). */
export function useWallet() {
  return useQuery({ queryKey: keys.painterWallet, queryFn: rewardsApi.wallet });
}

/** What the points buy, priced against the balance when read (P1, P4, P9). */
export function useCatalogue() {
  return useQuery({ queryKey: keys.painterCatalogue, queryFn: rewardsApi.catalogue });
}

/** What's been redeemed, newest first (P10, P11). */
export function useRedemptions() {
  return useQuery({ queryKey: keys.painterRedemptions, queryFn: rewardsApi.redemptions });
}

/** The trade profile and listing (P1, P4, P5, P9, P12). */
export function usePainterProfile() {
  return useQuery({
    queryKey: keys.painterProfile,
    queryFn: painterApi.profile,
    // No profile yet (404) is an answer, not a blip.
    retry: (failures, err) => !(isApiError(err) && err.kind === "http" && err.status === 404) && failures < 2,
  });
}

/** A painter account with no painter profile behind it — set one up, don't say "error". */
export function isNoProfile(err: unknown): boolean {
  return isApiError(err) && err.kind === "http" && err.status === 404;
}
