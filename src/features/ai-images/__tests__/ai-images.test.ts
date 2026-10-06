/**
 * The logic under C22–C24: what an image costs and how it is described, the choices a
 * route carries, the one ask that is never repeated, how long to wait between polls, and
 * what a failure may say about the credits.
 */
import { ApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import type { ProjectCombo, ProjectRender } from "@/api/types";

import { byBoard, comboPdfShades, comboWords, finishedImages, imageInProgress, optionName } from "../../boards/combos";
import { renderFailure } from "../failure";
import { choicesFrom, choicesOf, costOf, describeRender, DEFAULT_CHOICES } from "../render-options";
import { serverTime, startRender } from "../start-render";
import { isFinal, refundSeen, renderPollDelay, startedAtOf } from "../use-render";

const mockProjects = { requestRender: jest.fn(), renders: jest.fn() };
jest.mock("@/api/endpoints/projects", () => ({
  get projectsApi() {
    return mockProjects;
  },
}));

const render = (extra: Partial<ProjectRender> = {}): ProjectRender => ({
  id: "r1",
  comboId: "c1",
  status: "QUEUED",
  imageUrl: null,
  failureReason: null,
  timeOfDay: "DAY",
  borderMode: "KEEP_ORIGINAL",
  lighting: "NATURAL",
  furnishing: "KEEP",
  style: "MODERN",
  quality: "PREMIUM",
  sourceImage: "CLEANED",
  note: null,
  createdAt: "2026-10-06T10:00:00",
  completedAt: null,
  ...extra,
});

beforeEach(() => {
  mockProjects.requestRender.mockReset();
  mockProjects.renders.mockReset();
  queryClient.clear();
});

describe("what an image costs", () => {
  const wallet = { renderCost: 1, renderTiers: [{ quality: "PREMIUM", credits: 1 }, { quality: "LUXURY", credits: 3 }] };

  it("reads each quality's price from the wallet, never assuming one", () => {
    expect(costOf(wallet, "PREMIUM")).toBe(1);
    expect(costOf(wallet, "LUXURY")).toBe(3);
  });

  it("falls back to the standard price, then to one", () => {
    expect(costOf({ renderCost: 2 }, "LUXURY")).toBe(2);
    expect(costOf(null, "PREMIUM")).toBe(1);
    expect(costOf({ renderCost: 0, renderTiers: [] }, "PREMIUM")).toBe(1);
  });
});

describe("an image in a line", () => {
  it("names the look, the time and the light, and the quality only when it isn't the standard", () => {
    expect(describeRender(render())).toBe("Modern · Day · Natural light");
    expect(describeRender(render({ style: "HERITAGE", timeOfDay: "NIGHT", lighting: "WARM", quality: "LUXURY" }))).toBe(
      "Heritage · Night · Warm light · Luxury",
    );
  });

  it("keeps a word it doesn't know rather than dropping it", () => {
    expect(describeRender(render({ style: "ART_DECO" }))).toBe("ART_DECO · Day · Natural light");
  });
});

describe("choices carried on a route", () => {
  it("takes each value it knows and keeps the default for anything else", () => {
    expect(choicesFrom({ quality: "LUXURY", style: ["LUXE"], lighting: "NEON", timeOfDay: undefined })).toEqual({
      ...DEFAULT_CHOICES,
      quality: "LUXURY",
      style: "LUXE",
    });
  });

  it("round-trips an earlier image's choices", () => {
    const earlier = render({ style: "MINIMAL", furnishing: "EMPTY", sourceImage: "ORIGINAL" });
    expect(choicesFrom(choicesOf(earlier))).toEqual({ ...DEFAULT_CHOICES, style: "MINIMAL", furnishing: "EMPTY", sourceImage: "ORIGINAL" });
  });
});

describe("asking for an image", () => {
  const input = { projectId: "p1", comboId: "c1", choices: DEFAULT_CHOICES, note: "  curtains open " };

  it("asks once with every choice and a trimmed note, and keeps the answer for C24", async () => {
    mockProjects.renders.mockResolvedValue([]);
    mockProjects.requestRender.mockResolvedValue(render());
    const outcome = await startRender(input);
    expect(outcome).toEqual({ kind: "started", render: render() });
    expect(mockProjects.requestRender).toHaveBeenCalledWith("p1", { comboId: "c1", ...DEFAULT_CHOICES, note: "curtains open" });
    expect(queryClient.getQueryData(["me", "projects", "p1", "renders", "r1"])).toEqual(render());
  });

  it("leaves a blank note out", async () => {
    mockProjects.renders.mockResolvedValue([]);
    mockProjects.requestRender.mockResolvedValue(render());
    await startRender({ ...input, note: "   " });
    expect(mockProjects.requestRender.mock.calls[0]![1]).not.toHaveProperty("note");
  });

  it("obeys every reply: short of credits, an option or room gone, a note too long", async () => {
    mockProjects.renders.mockResolvedValue([]);
    mockProjects.requestRender.mockRejectedValueOnce(new ApiError("http", 402, "You need 2 AI image credits…"));
    expect(await startRender(input)).toEqual({ kind: "short", message: "You need 2 AI image credits…" });
    mockProjects.requestRender.mockRejectedValueOnce(new ApiError("http", 404, "That combination isn't on any of this room's colour boards."));
    expect((await startRender(input)).kind).toBe("optionGone");
    mockProjects.requestRender.mockRejectedValueOnce(new ApiError("http", 404, "Project not found: p1"));
    expect(await startRender(input)).toEqual({ kind: "refused", message: "This room isn't on your account any more." });
    mockProjects.requestRender.mockRejectedValueOnce(
      new ApiError("http", 400, "Some fields need your attention.", { note: "Keep the note under 500 characters." }),
    );
    expect(await startRender(input)).toEqual({ kind: "refused", message: "Keep the note under 500 characters.", field: "note" });
    expect(mockProjects.requestRender).toHaveBeenCalledTimes(4);
  });

  it("after silence, finds the image that is new since the ask — and never asks again", async () => {
    let asked = false;
    mockProjects.renders.mockImplementation(async () => (asked ? [render({ id: "new" }), render({ id: "old" })] : [render({ id: "old" })]));
    mockProjects.requestRender.mockImplementation(async () => {
      asked = true;
      throw new ApiError("timeout", 0, "Timed out");
    });
    const outcome = await startRender(input);
    expect(outcome.kind === "started" && outcome.render.id).toBe("new");
    expect(mockProjects.requestRender).toHaveBeenCalledTimes(1);
  });

  it("after silence, an older image of the option is not taken for this one", async () => {
    mockProjects.renders.mockResolvedValue([render({ id: "old" })]);
    mockProjects.requestRender.mockRejectedValue(new ApiError("http", 503, "Service unavailable"));
    expect(await startRender(input)).toEqual({ kind: "unknown" });
  });

  it("with the room's images unreadable before the ask, only one made just now can be ours", async () => {
    const now = Date.parse("2026-10-06T10:00:00+05:30");
    mockProjects.renders
      .mockRejectedValueOnce(new ApiError("network", 0, "Network error"))
      .mockResolvedValue([render({ id: "fresh", createdAt: "2026-10-06T10:00:30" }), render({ id: "stale", createdAt: "2026-10-06T09:30:00" })]);
    mockProjects.requestRender.mockRejectedValue(new ApiError("network", 0, "Network error"));
    const outcome = await startRender(input, () => now);
    expect(outcome.kind === "started" && outcome.render.id).toBe("fresh");
  });
});

describe("waiting for it", () => {
  it("polls every 2 s, then 5 s after a minute, then 15 s once it is very late", () => {
    expect(renderPollDelay(10_000)).toBe(2_000);
    expect(renderPollDelay(120_000)).toBe(5_000);
    expect(renderPollDelay(600_000)).toBe(15_000);
  });

  it("knows READY and FAILED for the end", () => {
    expect(isFinal(render({ status: "READY" }))).toBe(true);
    expect(isFinal(render({ status: "FAILED" }))).toBe(true);
    expect(isFinal(render({ status: "RUNNING" }))).toBe(false);
    expect(isFinal(null)).toBe(false);
  });

  it("reads the server's India time, and never starts the clock in the future", () => {
    expect(serverTime("2026-10-06T10:00:00")).toBe(Date.parse("2026-10-06T04:30:00Z"));
    expect(serverTime("2026-10-06T10:00:00Z")).toBe(Date.parse("2026-10-06T10:00:00Z"));
    const now = Date.parse("2026-10-06T04:30:10Z");
    expect(startedAtOf(render(), now)).toBe(Date.parse("2026-10-06T04:30:00Z"));
    expect(startedAtOf(render({ createdAt: "2026-10-06T11:00:00" }), now)).toBe(now);
    expect(startedAtOf(render({ createdAt: "garbage" }), now)).toBe(now);
  });
});

describe("what a failure may say", () => {
  it("gives the server's own sentence when it is fit to show", () => {
    const reason = "Your image couldn't be made just now. Your credit is back — please try again.";
    expect(renderFailure(reason, false)).toBe(reason);
  });

  it("says the credits are back only when the wallet shows it", () => {
    expect(renderFailure("REPLICATE_API_TOKEN not configured", false)).toBe("Your image couldn't be made just now. Please try again.");
    expect(renderFailure(null, true)).toBe("Your image couldn't be made just now. Your credits are back — please try again.");
  });

  it("takes a 'returned' row made since the ask as the sign — not an older one", () => {
    const failed = render({ status: "FAILED", createdAt: "2026-10-06T10:00:00" });
    const row = (createdAt: string) => ({ id: "a", credits: 1, type: "RENDER_REFUNDED", balanceAfter: 4, createdAt });
    expect(refundSeen({ recentActivity: [row("2026-10-06T10:05:00")] }, failed)).toBe(true);
    expect(refundSeen({ recentActivity: [row("2026-10-05T10:05:00")] }, failed)).toBe(false);
    expect(refundSeen({ recentActivity: [{ ...row("2026-10-06T10:05:00"), type: "PURCHASED" }] }, failed)).toBe(false);
    expect(refundSeen(null, failed)).toBe(false);
  });
});

describe("a room's board options", () => {
  const combo = (id: string, boardIndex: number, pageIndex: number, extra: Partial<ProjectCombo> = {}): ProjectCombo => ({
    id,
    boardIndex,
    pageIndex,
    rendered: false,
    shades: [{ regionId: 1, regionLabel: "Main wall", shadeCode: "HV0118", hvCode: "HV0118", hex: "#7b8a72" }],
    ...extra,
  });

  it("groups by board in printed order and names an option by its page", () => {
    const boards = byBoard([combo("b", 2, 0), combo("a2", 1, 1), combo("a1", 1, 0)]);
    expect(boards.map(([n, list]) => [n, list.map((c) => c.id)])).toEqual([
      [1, ["a1", "a2"]],
      [2, ["b"]],
    ]);
    expect(optionName(combo("x", 1, 2))).toBe("Option 3");
    expect(optionName(combo("x", 1, 2, { title: "  Calm  " }))).toBe("Calm");
  });

  it("reads an option's walls and codes, and prints a custom colour as such only where names show", () => {
    const custom = combo("x", 1, 0, { shades: [{ regionId: 2, regionLabel: null, hex: "#123456" }] });
    expect(comboWords(combo("x", 1, 0))).toBe("Main wall HV0118");
    expect(comboWords(custom)).toBe("Wall");
    expect(comboPdfShades(custom, true)[0]).toEqual({ label: "Wall", regionId: 2, name: "Custom colour", code: undefined, hex: "#123456" });
    expect(comboPdfShades(custom, false)[0]!.name).toBe("");
  });

  it("knows which options have a finished image, and an image still being made", () => {
    const list = [render({ id: "r3", comboId: "c2", status: "RUNNING" }), render({ id: "r2", comboId: "c1", status: "READY" }), render({ id: "r1", comboId: "c1", status: "READY" })];
    expect(finishedImages(list).get("c1")?.id).toBe("r2");
    expect(finishedImages(list).has("c2")).toBe(false);
    expect(imageInProgress(list)?.id).toBe("r3");
    expect(imageInProgress([render({ status: "FAILED" })])).toBeNull();
  });
});
