import { projectsApi } from "@/api/endpoints/projects";
import type { RoomDetail, RoomRegion } from "@/api/types";

import type { CanvasWall } from "./engine/RoomCanvas";
import { loadTexture } from "./engine/texture-loader";
import { canvasUrl, wallsWithMasks } from "./use-room";

/** A signed link changes on every answer; its path names the file. */
export function withoutQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/** The room's photo for the canvas, cached across signed links. */
export function roomPhoto(room: Pick<RoomDetail, "cleanedImageUrl" | "imageUrl">) {
  const url = canvasUrl(room);
  return { key: withoutQuery(url), load: () => loadTexture(url, withoutQuery(url)) };
}

/**
 * The room's walls for the canvas. Masks come through the backend's own mask route (with
 * the session: no expiring link, no CORS), cached by the stored file they point at, so a
 * redrawn wall is fetched again and an unchanged one is not.
 */
export function canvasWalls(
  room: Pick<RoomDetail, "id" | "regions">,
  colourOf: (region: RoomRegion) => Pick<CanvasWall, "hex" | "lrv" | "strength">,
  /** Where each mask comes from: the owner's route, or (D2) a shared link's. */
  maskPath: (regionId: number) => string = (regionId) => projectsApi.maskPath(room.id, regionId),
  /** What the masks are cached under — a shared room's never mixes with its owner's. */
  cacheScope: string = room.id,
): CanvasWall[] {
  return wallsWithMasks(room).map((r) => {
    const maskKey = `${cacheScope}:${r.id}:${withoutQuery(r.maskUrl ?? "")}`;
    const { hex, lrv, strength } = colourOf(r);
    return {
      id: String(r.id),
      maskKey,
      manual: r.manual,
      hex,
      lrv,
      strength,
      load: () => loadTexture(maskPath(r.id), maskKey),
    };
  });
}
