/**
 * /api/free-projects — ready-made rooms the HueVistaa team published.
 * Backend: library/controller/FreeProjectController. Screens: C1, C3, C20, C21.
 */
import { api } from "../instance";
import type { FreeProject, StartedFreeProject } from "../types";

export const libraryApi = {
  list: () => api.request<FreeProject[]>("api/free-projects"),

  get: (slug: string) => api.request<FreeProject>(`api/free-projects/${encodeURIComponent(slug)}`),

  /** The caller's own copy, walls already marked. Spends no room, credit or points. */
  start: (slug: string) =>
    api.request<StartedFreeProject>(`api/free-projects/${encodeURIComponent(slug)}/start`, { method: "POST" }),
};
