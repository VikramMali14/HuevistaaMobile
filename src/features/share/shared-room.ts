import type { SharedRoom } from "@/api/endpoints/share";
import type { RoomRegion } from "@/api/types";
import type { WallColour } from "@/features/studio/paint-store";
import { planWalls } from "@/features/studio/wall-plan";
import { wallsWithMasks } from "@/features/studio/use-room";

/**
 * A shared room (D2): its walls and the colours it was shared in. The visitor's own
 * colours live only in the screen — nothing here is saved, to anyone's room.
 */

/** A share link's token as minted (32 hex), read leniently so an older one still opens. */
export function shareTokenFrom(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_-]{16,64}$/.test(text) ? text : null;
}

/** The walls a visitor can repaint: in the plan, with a shape. */
export function sharedWalls(room: Pick<SharedRoom, "regions">): RoomRegion[] {
  return planWalls(wallsWithMasks(room));
}

/** The colours it was shared in, by wall — the HV code is what a visitor sees. */
export function sharedColours(room: Pick<SharedRoom, "regions">): Record<string, WallColour> {
  const out: Record<string, WallColour> = {};
  for (const r of sharedWalls(room)) {
    if (!r.appliedHexCode) continue;
    out[String(r.id)] = { hex: r.appliedHexCode, code: r.appliedHvCode ?? r.appliedShadeCode ?? null, lrv: null };
  }
  return out;
}
