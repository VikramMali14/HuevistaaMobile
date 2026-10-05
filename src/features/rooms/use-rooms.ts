import { useQuery } from "@tanstack/react-query";

import { meApi } from "@/api/endpoints/me";
import { keys } from "@/api/query-keys";

/** GET /api/projects. */
export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: meApi.projects });
}

/** GET /api/me/renders — the AI images. */
export function useRenders() {
  return useQuery({ queryKey: keys.renders, queryFn: meApi.renders });
}
