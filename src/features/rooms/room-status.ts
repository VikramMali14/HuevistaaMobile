import type { ProjectSummary } from "@/api/types";
import type { MessageKey } from "@/i18n";

const DAY_MS = 86_400_000;

/**
 * The one status chip a room card shows (docs/04 C2). Worked out from the summary the
 * backend sends — the same reading as HueVistaFrontEnd components/app/room-status.tsx.
 */
export type RoomChip = "working" | "markWalls" | "ready" | "failed" | "closed" | "viewOnly";

export function roomChip(p: ProjectSummary): RoomChip {
  if (p.closedAt) return "closed";
  if (p.readOnly) return "viewOnly";
  switch (p.status) {
    case "SEGMENTING":
      return "working";
    case "FAILED":
      return "failed";
    case "SEGMENTED":
      return p.regionCount > 0 ? "ready" : "markWalls";
    default:
      return "markWalls";
  }
}

export const roomChipLabel: Record<RoomChip, MessageKey> = {
  working: "rooms.chip.working",
  markWalls: "rooms.chip.markWalls",
  ready: "rooms.chip.ready",
  failed: "rooms.chip.failed",
  closed: "rooms.chip.closed",
  viewOnly: "rooms.chip.viewOnly",
};

/** Still being worked on: not finished, and not past its time. */
export function isInProgress(p: ProjectSummary): boolean {
  return !p.closedAt && !p.readOnly;
}

/** Whole days until the room closes, or null when it has no end (or it has passed). */
export function daysLeft(p: Pick<ProjectSummary, "accessExpiresAt" | "source">, now: number = Date.now()): number | null {
  if (!p.accessExpiresAt || p.source === "CUSTOMER") return null;
  const end = new Date(p.accessExpiresAt).getTime();
  if (Number.isNaN(end) || end <= now) return null;
  return Math.floor((end - now) / DAY_MS);
}

/** Newest activity first — the room someone was just in leads. */
export function byRecentActivity(a: ProjectSummary, b: ProjectSummary): number {
  const t = (p: ProjectSummary) => new Date(p.updatedAt ?? p.createdAt ?? 0).getTime() || 0;
  return t(b) - t(a);
}
