import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { colourFinderApi } from "@/api/endpoints/colour-finder";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import { msUntilEnd } from "@/features/shade-book/book";

/** Longest a timer is set for; a pass ending later is read again when the screen next opens. */
const LONGEST_WAIT_MS = 24 * 60 * 60_000;

/**
 * Whether the Colour finder is open to this account, and what opening it costs. Read again
 * when a payment changes it (it is in paymentChanges) and the moment a running pass ends, so
 * the finder shuts on time rather than asking for shades the server now refuses.
 */
export function useColourFinder() {
  const query = useQuery({ queryKey: keys.colourFinder, queryFn: colourFinderApi.get, staleTime: 60_000 });
  const access = query.data;
  const ends = access?.open && access.reason === "PASS" ? (access.expiresAt ?? null) : null;
  useEffect(() => {
    const until = msUntilEnd(ends);
    if (until === null || until > LONGEST_WAIT_MS) return;
    const timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: keys.colourFinder }), until + 1000);
    return () => clearTimeout(timer);
  }, [ends]);
  return query;
}

/** A refusal that asking again won't change. */
function refused(err: unknown): boolean {
  return isApiError(err) && err.kind === "http" && err.status >= 400 && err.status < 500;
}

/**
 * The HueVistaa shades nearest a colour, while the finder is open — never asked for while it is
 * shut, since the server would only refuse. `shut` is that refusal arriving anyway (the pass
 * ended a moment ago): the finder's standing is read again, which shuts it here too.
 */
export function useVistaMatches(hex: string | null, open: boolean) {
  const query = useQuery({
    queryKey: keys.colourFinderMatch(hex ?? ""),
    queryFn: () => colourFinderApi.match(hex!, 6),
    enabled: open && Boolean(hex),
    staleTime: 10 * 60_000,
    retry: (count, err) => !refused(err) && count < 2,
  });
  const shut = isApiError(query.error) && query.error.kind === "http" && query.error.status === 402;
  useEffect(() => {
    if (shut) void queryClient.invalidateQueries({ queryKey: keys.colourFinder }).catch(() => {});
  }, [shut]);
  return { ...query, shut };
}
