/**
 * One room and its walls: create, segment, poll, paint, plan, masks, suggestions, reports.
 * Backend: project/controller/ProjectController, ai/controller/ColorRecommendationController,
 * maskreport/controller/MaskReportController. Screens: C2, C7–C14, C18.
 */
import { api } from "../instance";
import type {
  MaskReport,
  MaskReportIssue,
  Recommendations,
  RegionCategory,
  RegionColourUpdate,
  RegionPlanUpdate,
  RoomDetail,
  RoomRegion,
  SegmentChoices,
} from "../types";

export const projectsApi = {
  get: (id: string) => api.request<RoomDetail>(`api/projects/${encodeURIComponent(id)}`),

  /** C7. Spends one of the account's rooms. */
  create: (body: { imageId: string; name?: string; roomType?: string }) =>
    api.request<RoomDetail>("api/projects", { body }),

  /** C2 rename. A blank name is refused. */
  rename: (id: string, name: string) =>
    api.request<RoomDetail>(`api/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } }),

  /** C2. Permanent, and does not give the room back. */
  remove: (id: string) => api.request<void>(`api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** C8. Returns at once with SEGMENTING; poll {@link status}. */
  segment: (id: string, choices: SegmentChoices) =>
    api.request<RoomDetail>(`api/projects/${encodeURIComponent(id)}/segment`, { body: choices }),

  status: (id: string) => api.request<RoomDetail>(`api/projects/${encodeURIComponent(id)}/status`),

  /** C11 autosave. */
  saveColours: (id: string, updates: RegionColourUpdate[]) =>
    api.request<void>(`api/projects/${encodeURIComponent(id)}/regions`, { method: "PUT", body: updates }),

  /** C9. */
  savePlan: (id: string, updates: RegionPlanUpdate[]) =>
    api.request<void>(`api/projects/${encodeURIComponent(id)}/regions/plan`, { method: "PUT", body: updates }),

  /** C10: a new wall drawn by hand. The mask is a PNG at the cleaned photo's size. */
  addWall: (id: string, body: { maskBase64: string; label: string; category: RegionCategory }) =>
    api.request<RoomRegion>(`api/projects/${encodeURIComponent(id)}/regions/custom-mask`, { body, timeoutMs: 60_000 }),

  /** C10: reshape a wall (found or drawn). */
  replaceMask: (id: string, regionId: number, maskBase64: string) =>
    api.request<RoomRegion>(`api/projects/${encodeURIComponent(id)}/regions/${regionId}/mask`, {
      method: "PUT",
      body: { maskBase64 },
      timeoutMs: 60_000,
    }),

  /** C10. The room's last wall is refused (409, a sentence to show). */
  removeWall: (id: string, regionId: number) =>
    api.request<void>(`api/projects/${encodeURIComponent(id)}/regions/${regionId}`, { method: "DELETE" }),

  /** The backend's own route to a wall's mask (with the session; no CORS, no expiry). */
  maskPath: (id: string, regionId: number) => `/api/projects/${encodeURIComponent(id)}/regions/${regionId}/mask`,

  /** C13. Free and instant; `round` asks for a different set. 402: the room has closed. */
  suggestions: (id: string, round: number) =>
    api.request<Recommendations>(`api/projects/${encodeURIComponent(id)}/recommendations`, {
      method: "POST",
      query: { round },
    }),

  /**
   * C9/C18. Null when the room was never reported — the backend answers 204, and a query
   * may not hold `undefined`.
   */
  latestReport: async (id: string) =>
    (await api.request<MaskReport | undefined>(`api/projects/${encodeURIComponent(id)}/mask-reports/latest`)) ?? null,

  /** C18. Reporting again updates the open report. */
  report: (id: string, body: { issues: MaskReportIssue[]; note?: string }) =>
    api.request<MaskReport>(`api/projects/${encodeURIComponent(id)}/mask-reports`, { body }),
};
