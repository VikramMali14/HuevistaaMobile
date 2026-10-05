import { useQuery } from "@tanstack/react-query";

import { libraryApi } from "@/api/endpoints/library";
import { keys } from "@/api/query-keys";

/**
 * The ready-made rooms. Hidden everywhere when there are none — and a failed read is
 * treated the same way (the website does too): an outage should not leave an empty shelf.
 */
export function useLibrary() {
  const query = useQuery({ queryKey: keys.library, queryFn: libraryApi.list, staleTime: 5 * 60_000 });
  const rooms = (query.data ?? []).filter((r) => r?.slug && r.imageUrl);
  return { ...query, rooms, live: rooms.length > 0 };
}
