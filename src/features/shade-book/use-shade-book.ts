import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { shadeBookApi } from "@/api/endpoints/shade-book";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";

import { msUntilEnd } from "./book";

/** Longest a timer is set for; a pass ending later is read again when the screen next opens. */
const LONGEST_WAIT_MS = 24 * 60 * 60_000;

/**
 * The Shade Book as this account may read it. Read again when a payment changes it (it is in
 * paymentChanges) and the moment a running pass ends, so the book shuts on time rather than
 * leaving pictures the server now refuses.
 */
export function useShadeBook() {
  const query = useQuery({ queryKey: keys.shadeBook, queryFn: shadeBookApi.get, staleTime: 60_000 });
  const access = query.data?.access;
  const ends = access?.open && access.reason === "PASS" ? (access.expiresAt ?? null) : null;
  useEffect(() => {
    const until = msUntilEnd(ends);
    if (until === null || until > LONGEST_WAIT_MS) return;
    const timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: keys.shadeBook }), until + 1000);
    return () => clearTimeout(timer);
  }, [ends]);
  return query;
}
