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
export function roomPhoto(room: RoomDetail) {
  const url = canvasUrl(room);
  return { key: withoutQuery(url), load: () => loadTexture(url, withoutQuery(url)) };
}

/**
 * The room's walls for the canvas. Masks come through the backend's own mask route (with
 * the session: no expiring link, no CORS), cached by the stored file they point at, so a
 * redrawn wall is fetched again and an unchanged one is not.
 */
export function canvasWalls(
  room: RoomDetail,
  colourOf: (region: RoomRegion) => { hex: string | null; lrv?: number | null },
): CanvasWall[] {
  return wallsWithMasks(room).map((r) => {
    const maskKey = `${room.id}:${r.id}:${withoutQuery(r.maskUrl ?? "")}`;
    const { hex, lrv } = colourOf(r);
    return {
      id: String(r.id),
      maskKey,
      manual: r.manual,
      hex,
      lrv,
      load: () => loadTexture(projectsApi.maskPath(room.id, r.id), maskKey),
    };
  });
}
