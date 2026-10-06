/**
 * One room and its walls: create, segment, poll, paint, plan, masks, suggestions, reports,
 * its colour board and its share link.
 * Backend: project/controller/ProjectController, ai/controller/ColorRecommendationController,
 * maskreport/controller/MaskReportController, reward/controller/ProjectRewardController.
 * Screens: C2, C7–C18, C22–C25.
 */
import { api } from "../instance";
import type {
  ColourBoardPage,
  ColourBoardResult,
  MaskReport,
  MaskReportIssue,
  ProjectCombo,
  ProjectRender,
  Recommendations,
  RegionCategory,
  RegionColourUpdate,
  RegionPlanUpdate,
  RenderRequest,
  RewardCode,
  RoomDetail,
  RoomRegion,
  SegmentChoices,
  ShareLink,
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

  /**
   * C15. The QR for the board's last page, minted once per room for life — so it is asked
   * for only when a board is actually being made. Null (204) when the board carries none:
   * a ready-made room's.
   */
  rewardCode: async (id: string) =>
    (await api.request<RewardCode | undefined>(`api/projects/${encodeURIComponent(id)}/reward-code`)) ?? null,

  /**
   * C15. Charges for the board and records what was on it. 402: nothing left to pay with;
   * 409: the room is closed, its boards are spent, or the sheet is bigger than allowed.
   */
  recordBoard: (id: string, pages: ColourBoardPage[]) =>
    api.request<ColourBoardResult>(`api/projects/${encodeURIComponent(id)}/colour-boards`, {
      body: { pages },
      timeoutMs: 30_000,
    }),

  /** C25. Every option the room's boards handed over, in the order they were on the sheet. */
  combos: (id: string) => api.request<ProjectCombo[]>(`api/projects/${encodeURIComponent(id)}/combos`),

  /**
   * C23. Asks for an AI image of one option: 202 with the image QUEUED, its credits spent
   * there and then. Never repeated on its own (every ask is a new charge), and given time:
   * with the server's AI queue full, the answer can be slow in coming.
   * 402: not enough credits · 404: the room or the option has gone · 429: too many asks.
   */
  requestRender: (id: string, body: RenderRequest) =>
    api.request<ProjectRender>(`api/projects/${encodeURIComponent(id)}/renders`, { body, timeoutMs: 45_000 }),

  /** C23, C25. Every AI image of the room, in any state, newest first. */
  renders: (id: string) => api.request<ProjectRender[]>(`api/projects/${encodeURIComponent(id)}/renders`),

  /** C24's poll. 404 when it isn't this account's room's (or the room has gone). */
  render: (id: string, renderId: string) =>
    api.request<ProjectRender>(`api/projects/${encodeURIComponent(id)}/renders/${encodeURIComponent(renderId)}`),

  /**
   * C17. Creates the room's link, or refreshes the same one. `days` is 3, 7 or 10 (the
   * backend makes anything else 10); `brands` are company NAMES, comma-separated, left out
   * for every company. Both are query parameters, not a body.
   */
  share: (id: string, days: 3 | 7 | 10, brands?: readonly string[]) =>
    api.request<ShareLink>(`api/projects/${encodeURIComponent(id)}/share`, {
      method: "POST",
      query: { days, brands: brands?.length ? brands.join(",") : undefined },
    }),

  /** C17. Withdraws the link; anyone who opens it is told it has stopped working. */
  unshare: (id: string) => api.request<void>(`api/projects/${encodeURIComponent(id)}/share`, { method: "DELETE" }),
};
