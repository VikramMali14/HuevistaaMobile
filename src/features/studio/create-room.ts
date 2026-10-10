import { meApi } from "@/api/endpoints/me";
import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";

export interface NewRoom {
  imageId: string;
  name: string;
  roomType?: string;
}

/** No connection, a timeout or a 5xx: nothing says whether the room was made. */
function unanswered(err: unknown): boolean {
  return !isApiError(err) || err.kind !== "http" || err.status >= 500;
}

/**
 * The account's room made from this photo, if there is one. Asked directly — never through
 * the cache, whose reads wait while the phone is offline. Throws when the list can't be read.
 */
async function roomFrom(imageId: string): Promise<string | null> {
  const list = await meApi.projects();
  queryClient.setQueryData(keys.projects, list);
  return list.find((p) => p.imageId === imageId)?.id ?? null;
}

/**
 * C7 · Create: the new room's id. Spending happens on the server with no request key, so a
 * second create is a second room. Each photo is uploaded afresh for its room, so a room
 * made from it is this one: after a create that went unanswered it is looked for, and
 * `sentBefore` looks first — Create is only sent again once the list shows it never landed.
 */
export async function createRoom(room: NewRoom, sentBefore: boolean): Promise<string> {
  if (sentBefore) {
    const landed = await roomFrom(room.imageId);
    if (landed) return landed;
  }
  try {
    return (await projectsApi.create(room)).id;
  } catch (err) {
    if (!unanswered(err)) throw err;
    const landed = await roomFrom(room.imageId).catch(() => null);
    if (landed) return landed;
    throw err;
  }
}
