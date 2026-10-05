import { useQueries } from "@tanstack/react-query";

import { meApi } from "@/api/endpoints/me";
import { keys } from "@/api/query-keys";

import { balanceFrom, type Balance } from "./balance";

function answer<T>(q: { isSuccess: boolean; isError: boolean; data: T | undefined }) {
  if (q.isSuccess) return { ok: true as const, value: q.data as T };
  if (q.isError) return { ok: false as const };
  return null;
}

/** The rooms and AI credits this account holds, and its one next step (C1, C5, C27). */
export function useBalance(): Balance & { loading: boolean; refetch: () => Promise<unknown> } {
  const [ent, opts, wallet] = useQueries({
    queries: [
      { queryKey: keys.entitlement, queryFn: meApi.entitlement },
      { queryKey: keys.projectOptions, queryFn: meApi.projectOptions },
      { queryKey: keys.aiCredits, queryFn: meApi.aiCredits },
    ],
  });
  return {
    ...balanceFrom(answer(ent), answer(opts), answer(wallet)),
    loading: ent.isPending,
    refetch: () => Promise.all([ent.refetch(), opts.refetch(), wallet.refetch()]),
  };
}
