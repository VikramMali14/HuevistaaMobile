import type { ProjectSummary } from "@/api/types";

import { byRecentActivity, daysLeft, isInProgress, roomChip } from "../room-status";

const room = (extra: Partial<ProjectSummary>): ProjectSummary => ({
  id: "p1",
  name: "Bedroom",
  status: "SEGMENTED",
  imageId: "i1",
  imageUrl: "/api/images/files/a.jpg",
  regionCount: 3,
  ...extra,
});

describe("roomChip", () => {
  it.each([
    [{ status: "SEGMENTING" as const }, "working"],
    [{ status: "CREATED" as const }, "markWalls"],
    [{ status: "SEGMENTED" as const, regionCount: 0 }, "markWalls"],
    [{ status: "SEGMENTED" as const }, "ready"],
    [{ status: "FAILED" as const }, "failed"],
    [{ closedAt: "2026-10-01T10:00:00" }, "closed"],
    [{ readOnly: true }, "viewOnly"],
  ])("%j → %s", (extra, chip) => {
    expect(roomChip(room(extra))).toBe(chip);
  });
});

describe("daysLeft", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  it("counts whole days to the end", () => {
    expect(daysLeft(room({ accessExpiresAt: "2026-10-15T12:00:00Z" }), now)).toBe(10);
  });
  it("is null with no end, a past end, or a shop's own customer room", () => {
    expect(daysLeft(room({}), now)).toBeNull();
    expect(daysLeft(room({ accessExpiresAt: "2026-10-01T00:00:00Z" }), now)).toBeNull();
    expect(daysLeft(room({ accessExpiresAt: "2026-10-15T00:00:00Z", source: "CUSTOMER" }), now)).toBeNull();
  });
});

describe("in progress, newest first", () => {
  it("leaves out finished and view-only rooms", () => {
    expect(isInProgress(room({}))).toBe(true);
    expect(isInProgress(room({ closedAt: "2026-10-01" }))).toBe(false);
    expect(isInProgress(room({ readOnly: true }))).toBe(false);
  });
  it("sorts by the latest activity", () => {
    const rooms = [room({ id: "a", updatedAt: "2026-10-01" }), room({ id: "b", updatedAt: "2026-10-04" })];
    expect(rooms.sort(byRecentActivity).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
