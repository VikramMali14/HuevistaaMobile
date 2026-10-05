import type { MaskReport, RegionCategory, RoomRegion } from "@/api/types";
import { t, type MessageKey } from "@/i18n";

/**
 * The paint plan (website lib/wall-plan.ts): which of a room's surfaces are being painted,
 * and the order colours are handed to them — base first, then the wall that answers it,
 * any other walls, the ceiling, the trim. A wall out of the plan keeps its shape and its
 * colour; it is just not one of the surfaces being painted.
 */
const ROLE_RANK: Record<RegionCategory, number> = {
  MAIN_WALL: 0,
  ACCENT_WALL: 1,
  OTHER_WALL: 2,
  MANUAL: 3,
  CEILING: 4,
  TRIM: 5,
};

/** Absent means in — every wall behaved that way before the flag existed. */
export function isInPlan(region: { inPlan?: boolean }): boolean {
  return region.inPlan !== false;
}

/** The walls being painted, in the order a palette's colours go to them. */
export function planWalls<T extends { category: RegionCategory; inPlan?: boolean }>(regions: readonly T[] | undefined): T[] {
  return (regions ?? [])
    .filter(isInPlan)
    .map((region, i) => ({ region, i }))
    .sort((a, b) => ROLE_RANK[a.region.category] - ROLE_RANK[b.region.category] || a.i - b.i)
    .map(({ region }) => region);
}

/** A wall's name: its own label, or what it is. */
export function wallLabel(region: Pick<RoomRegion, "label" | "category">): string {
  return region.label?.trim() || t(`walls.categories.${region.category}` as MessageKey);
}

/** The colours walls are told apart by on C9 and C10 — never a paint choice. */
export const WALL_TINTS = ["#c08b4e", "#5b8c6e", "#5b6d8c", "#a3485a", "#8c7a5b", "#6e5b8c", "#4f8a8b", "#b07a3c"];

/** What the latest report on a room says (C9's banner), or null when there is nothing to say. */
export function reportLine(report: MaskReport | undefined | null): string | null {
  if (!report) return null;
  if (report.status === "NEW" || report.status === "IN_REVIEW") return t("walls.reportOpen");
  if (report.status === "FIXED") {
    return report.fixNote?.trim() ? t("walls.reportFixed", { note: report.fixNote.trim() }) : t("walls.reportFixedPlain");
  }
  return t("walls.reportClosed");
}

/**
 * Where a suggested palette's main / accent / trim colours go (website shade-grid.tsx
 * `slotsForRoles`): the main colour on the main wall — or, in a room where none is named,
 * on the wall being looked at — the accent on the accent wall (else another wall), the
 * trim on the trim. A slot with no wall to take it gets nothing.
 */
export function wallsForTrio<T extends { id: number; category: RegionCategory }>(
  walls: readonly T[],
  activeId: number | null,
): [T | undefined, T | undefined, T | undefined] {
  const taken = new Set<number>();
  const claim = (...kinds: RegionCategory[]): T | undefined => {
    for (const kind of kinds) {
      const wall = walls.find((w) => w.category === kind && !taken.has(w.id));
      if (wall) {
        taken.add(wall.id);
        return wall;
      }
    }
    return undefined;
  };
  const claimActive = (): T | undefined => {
    const wall = walls.find((w) => w.id === activeId && !taken.has(w.id));
    if (wall) taken.add(wall.id);
    return wall;
  };
  const main = claim("MAIN_WALL") ?? claimActive() ?? claim("OTHER_WALL", "MANUAL", "ACCENT_WALL", "TRIM");
  const accent = claim("ACCENT_WALL", "OTHER_WALL", "MANUAL");
  const trim = claim("TRIM");
  return [main, accent, trim];
}
