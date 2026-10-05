import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError, isRetryable, messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { RegionColourUpdate, RoomDetail, RoomRegion } from "@/api/types";

/** A colour on a wall: the HV code it was picked as (or null for a mixed colour), and its hex. */
export interface WallColour {
  hex: string;
  /** The HV code — the only code a customer's studio holds; the backend maps it back. */
  code: string | null;
  /** Light reflectance, when the colour is a catalogue shade (paints at its true lightness). */
  lrv?: number | null;
}

export type Colours = Readonly<Record<string, WallColour | null>>;

export interface RoomPaint {
  colours: Colours;
  /** The colours as the server last had them — what a refused change goes back to. */
  saved: Colours;
  /** The wall the next colour goes on. */
  selected: string | null;
  /** Earlier colourings, newest last, for Undo. */
  history: Colours[];
  /** Changes not yet on the server. */
  pending: Colours;
  /** The last save failed; they are kept and sent again. */
  saveFailed: boolean;
  /**
   * The server refused the changes for good (the room closed, or is gone) — said in its
   * own words. They are dropped rather than sent every few seconds for ever.
   */
  refused: string | null;
}

/** C11: colour changes are saved this long after the last one. */
export const SAVE_DEBOUNCE_MS = 600;
const RETRY_MS = 10_000;
const HISTORY_MAX = 30;

const rooms = new Map<string, RoomPaint>();
const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const saving = new Set<string>();

const EMPTY: RoomPaint = { colours: {}, saved: {}, selected: null, history: [], pending: {}, saveFailed: false, refused: null };

function emit(id: string) {
  for (const l of listeners.get(id) ?? []) l();
}

function update(id: string, next: RoomPaint) {
  rooms.set(id, next);
  emit(id);
}

/** How a saved wall's colour is read: by default its hex and code as stored. */
export type ColourReader = (region: RoomRegion) => WallColour | null;

const asStored: ColourReader = (r) =>
  r.appliedHexCode ? { hex: r.appliedHexCode, code: r.appliedHvCode ?? r.appliedShadeCode ?? null } : null;

/** The colours a room was saved with, from its walls. */
export function coloursFrom(room: Pick<RoomDetail, "regions">, read: ColourReader = asStored): Record<string, WallColour | null> {
  const out: Record<string, WallColour | null> = {};
  for (const r of room.regions ?? []) out[String(r.id)] = read(r);
  return out;
}

/**
 * Start (or refresh) a room's colours from what the server has. Colours changed on this
 * phone and not yet saved win over the server's, so a refetch never undoes a tap. The
 * selected wall is always one of `walls` (those being painted, in order) — a wall taken
 * out of the plan on C9 can't stay selected out of sight. `read` finds each saved
 * colour's shade again (saved-colours.ts), once the catalogue is there.
 */
export function initRoom(id: string, room: Pick<RoomDetail, "regions">, walls: readonly string[], read?: ColourReader) {
  const current = rooms.get(id);
  const saved = coloursFrom(room, read);
  const colours = { ...saved, ...(current?.pending ?? {}) };
  update(id, {
    colours,
    saved,
    selected: current?.selected && walls.includes(current.selected) ? current.selected : (walls[0] ?? null),
    history: current?.history ?? [],
    pending: current?.pending ?? {},
    saveFailed: current?.saveFailed ?? false,
    refused: current?.refused ?? null,
  });
}

export function selectWall(id: string, wallId: string | null) {
  const s = rooms.get(id) ?? EMPTY;
  if (s.selected !== wallId) update(id, { ...s, selected: wallId });
}

/** Paint walls (one, or a whole palette) and queue the save. */
export function applyColours(id: string, changes: Colours) {
  const s = rooms.get(id) ?? EMPTY;
  const same = Object.entries(changes).every(([k, v]) => sameColour(s.colours[k] ?? null, v));
  if (same) return;
  update(id, {
    ...s,
    colours: { ...s.colours, ...changes },
    history: [...s.history, s.colours].slice(-HISTORY_MAX),
    pending: { ...s.pending, ...changes },
    refused: null,
  });
  scheduleSave(id, SAVE_DEBOUNCE_MS);
}

/** Put back the colouring before the last change (and save that). */
export function undo(id: string) {
  const s = rooms.get(id);
  const previous = s?.history[s.history.length - 1];
  if (!s || !previous) return;
  const changes: Record<string, WallColour | null> = {};
  for (const k of new Set([...Object.keys(previous), ...Object.keys(s.colours)])) {
    if (!sameColour(previous[k] ?? null, s.colours[k] ?? null)) changes[k] = previous[k] ?? null;
  }
  update(id, { ...s, colours: previous, history: s.history.slice(0, -1), pending: { ...s.pending, ...changes } });
  scheduleSave(id, SAVE_DEBOUNCE_MS);
}

function sameColour(a: WallColour | null, b: WallColour | null): boolean {
  if (!a || !b) return a === b;
  return a.hex.toLowerCase() === b.hex.toLowerCase() && (a.code ?? null) === (b.code ?? null);
}

function scheduleSave(id: string, delay: number) {
  const old = timers.get(id);
  if (old) clearTimeout(old);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void flush(id);
    }, delay),
  );
}

/** The rows for `PUT /api/projects/{id}/regions`. */
export function saveRows(pending: Colours): RegionColourUpdate[] {
  return Object.entries(pending).map(([regionId, c]) => ({
    regionId: Number(regionId),
    shadeCode: c?.code ?? null,
    hexCode: c?.hex ?? null,
  }));
}

/** Send what is waiting now (also on leaving the screen). */
export async function flush(id: string): Promise<void> {
  const s = rooms.get(id);
  if (!s || saving.has(id) || Object.keys(s.pending).length === 0) return;
  const sent = s.pending;
  saving.add(id);
  try {
    await projectsApi.saveColours(id, saveRows(sent));
    const now = rooms.get(id);
    if (!now) return; // forgotten meanwhile (deleted, or signed out)
    // Keep anything changed again while this was in flight.
    const left: Record<string, WallColour | null> = {};
    for (const [k, v] of Object.entries(now.pending)) if (!(k in sent) || !sameColour(sent[k] ?? null, v)) left[k] = v;
    update(id, { ...now, pending: left, saveFailed: false });
    if (Object.keys(left).length) scheduleSave(id, SAVE_DEBOUNCE_MS);
  } catch (err) {
    const now = rooms.get(id);
    if (!now) return;
    if (isApiError(err) && err.kind === "http" && !isRetryable(err)) {
      // Refused, not lost: the room closed or went while this was being painted. Sending
      // it again won't change the answer — drop it and read the room again, which shows
      // it as it now is (view only, or gone).
      const left: Record<string, WallColour | null> = {};
      for (const [k, v] of Object.entries(now.pending)) if (!(k in sent) || !sameColour(sent[k] ?? null, v)) left[k] = v;
      // The walls show what is really saved again.
      const colours = { ...now.colours };
      for (const k of Object.keys(sent)) if (!(k in left)) colours[k] = now.saved[k] ?? null;
      update(id, { ...now, colours, pending: left, saveFailed: false, refused: messageFor(err) });
      void queryClient.invalidateQueries({ queryKey: keys.room(id), exact: true });
    } else {
      update(id, { ...now, saveFailed: true });
      scheduleSave(id, RETRY_MS);
    }
  } finally {
    saving.delete(id);
  }
}

// Offline changes go as soon as the phone is back online.
NetInfo.addEventListener((state) => {
  if (!state.isConnected) return;
  for (const [id, s] of rooms) if (s.saveFailed && Object.keys(s.pending).length) void flush(id);
});

// A phone can close an app it has put in the background: what is waiting goes now, not
// after the debounce (timers don't run in the background).
AppState.addEventListener("change", (next) => {
  if (next === "active") return;
  for (const [id, s] of rooms) if (Object.keys(s.pending).length) void flush(id);
});

export function getRoomPaint(id: string): RoomPaint {
  return rooms.get(id) ?? EMPTY;
}

export function useRoomPaint(id: string): RoomPaint {
  return useSyncExternalStore(
    (l) => {
      let set = listeners.get(id);
      if (!set) listeners.set(id, (set = new Set()));
      set.add(l);
      return () => set.delete(l);
    },
    () => rooms.get(id) ?? EMPTY,
    () => rooms.get(id) ?? EMPTY,
  );
}

/** The refusal has been seen (they left Paint): don't keep saying it. */
export function clearRefused(id: string) {
  const s = rooms.get(id);
  if (s?.refused) update(id, { ...s, refused: null });
}

/** Forget one room (it was deleted): nothing of it is sent again. */
export function forgetRoom(id: string) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  rooms.delete(id);
  emit(id);
}

/** Forget every room (sign-out). */
export function resetPaintStore() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  rooms.clear();
}

// ── Recent shades ────────────────────────────────────────────────────────────

export interface RecentShade {
  hex: string;
  code: string;
  brandSlug?: string | null;
  lrv?: number | null;
}

const RECENT_KEY = "hv.recentShades";
const RECENT_MAX = 12;
let recent: RecentShade[] = [];
let recentLoaded = false;
const recentListeners = new Set<() => void>();

function emitRecent() {
  for (const l of recentListeners) l();
}

async function loadRecent() {
  if (recentLoaded) return;
  recentLoaded = true;
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) ?? "[]") as RecentShade[];
    if (Array.isArray(stored) && recent.length === 0) {
      recent = stored.slice(0, RECENT_MAX);
      emitRecent();
    }
  } catch {
    // No recent row then.
  }
}

/** A shade was used: it leads the Recent row. */
export function pushRecent(shade: RecentShade) {
  recent = [shade, ...recent.filter((r) => r.code !== shade.code)].slice(0, RECENT_MAX);
  emitRecent();
  void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(recent)).catch(() => {});
}

export function useRecentShades(): RecentShade[] {
  void loadRecent();
  return useSyncExternalStore(
    (l) => {
      recentListeners.add(l);
      return () => recentListeners.delete(l);
    },
    () => recent,
    () => recent,
  );
}

/** Forget the recent row (sign-out: it may be another person's next). */
export async function resetRecentShades() {
  recent = [];
  recentLoaded = true;
  emitRecent();
  await AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
}
