import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { projectsApi } from "@/api/endpoints/projects";
import { keys } from "@/api/query-keys";
import type { RoomDetail, RoomRegion } from "@/api/types";

/** One room with its walls, shared by every studio step through the cache. */
export function useRoom(id: string) {
  return useQuery({ queryKey: keys.room(id), queryFn: () => projectsApi.get(id), enabled: Boolean(id) });
}

/** Walls that have a shape to paint. */
export function wallsWithMasks(room: Pick<RoomDetail, "regions">): RoomRegion[] {
  return (room.regions ?? []).filter((r) => r.maskUrl);
}

/** The picture the walls were found on: the cleaned canvas when there is one. */
export function canvasUrl(room: Pick<RoomDetail, "cleanedImageUrl" | "imageUrl">): string {
  return room.cleanedImageUrl || room.imageUrl;
}

export type RoomStep = "tidy" | "walls" | "adjust" | "paint";

/**
 * Where a room opens (docs/04 "The studio" table): not yet cleaned or still working or
 * failed → Tidy up; ready with no walls → Adjust (mark them); ready with walls → Walls
 * the first time, Paint once it has been painted on this phone. A finished or view-only
 * room opens on Paint, which shows it without letting it change (C25 takes finished
 * rooms over in Phase 4).
 */
export function stepFor(room: RoomDetail, paintedBefore: boolean): RoomStep {
  if (room.closedAt || room.readOnly) return "paint";
  if (room.status !== "SEGMENTED") return "tidy";
  if (wallsWithMasks(room).length === 0) return "adjust";
  return paintedBefore ? "paint" : "walls";
}

const PAINTED_KEY = "hv.paintedRooms";

/** Rooms opened on Paint on this phone — they open there again. */
export async function wasPainted(id: string): Promise<boolean> {
  try {
    const ids = JSON.parse((await AsyncStorage.getItem(PAINTED_KEY)) ?? "[]") as string[];
    return ids.includes(id);
  } catch {
    return false;
  }
}

export async function markPainted(id: string): Promise<void> {
  try {
    const ids = JSON.parse((await AsyncStorage.getItem(PAINTED_KEY)) ?? "[]") as string[];
    if (ids.includes(id)) return;
    await AsyncStorage.setItem(PAINTED_KEY, JSON.stringify([id, ...ids].slice(0, 200)));
  } catch {
    // Only a convenience: the room opens on Walls instead.
  }
}
