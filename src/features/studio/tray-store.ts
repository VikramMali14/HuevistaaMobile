import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import type { Colours, WallColour } from "./paint-store";

/**
 * The board tray (C11 "Save this combination"): colourings kept on the phone until a
 * colour board is made from them (C15) — the website keeps its tray in the browser too.
 */
export interface SavedCombo {
  colours: Record<string, WallColour>;
  savedAt: number;
}

const KEY = "hv.boardTrays";
const EMPTY: SavedCombo[] = [];
let trays: Record<string, SavedCombo[]> = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  void AsyncStorage.setItem(KEY, JSON.stringify(trays)).catch(() => {});
}

function setTray(roomId: string, list: SavedCombo[]) {
  if (list.length) {
    trays = { ...trays, [roomId]: list };
  } else {
    const { [roomId]: _gone, ...rest } = trays;
    trays = rest;
  }
  emit();
  persist();
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "{}") as Record<string, SavedCombo[]>;
    if (stored && typeof stored === "object") {
      trays = { ...stored, ...trays };
      emit();
    }
  } catch {
    // An empty tray, then.
  }
}

function sameCombo(a: Record<string, WallColour>, b: Record<string, WallColour>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => b[k] && b[k]!.hex.toLowerCase() === a[k]!.hex.toLowerCase());
}

/** Keep the painted walls' colours. Returns false when that exact combination is already kept. */
export function saveCombo(roomId: string, colours: Colours, wallIds: readonly string[]): boolean {
  const picked: Record<string, WallColour> = {};
  for (const id of wallIds) {
    const c = colours[id];
    if (c) picked[id] = c;
  }
  if (Object.keys(picked).length === 0) return false;
  const list = trays[roomId] ?? [];
  if (list.some((c) => sameCombo(c.colours, picked))) return false;
  // Also the combination's name in the tray: never the same twice, even in one millisecond.
  const savedAt = Math.max(Date.now(), (list[list.length - 1]?.savedAt ?? 0) + 1);
  setTray(roomId, [...list, { colours: picked, savedAt }]);
  return true;
}

/** C15: take one combination off the board. */
export function removeCombo(roomId: string, savedAt: number) {
  const list = trays[roomId] ?? [];
  setTray(roomId, list.filter((c) => c.savedAt !== savedAt));
}

/** C15: put the combinations in the order the board will print them. */
export function reorderTray(roomId: string, next: readonly SavedCombo[]) {
  setTray(roomId, [...next]);
}

export function useTray(roomId: string): SavedCombo[] {
  void load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => trays[roomId] ?? EMPTY,
    () => trays[roomId] ?? EMPTY,
  );
}
/** Forget one room's tray (the room was deleted, or its board was made). */
export function forgetTray(roomId: string) {
  if (!(roomId in trays)) return;
  setTray(roomId, []);
}

/** Forget every tray (sign-out). */
export function resetTrays() {
  trays = {};
  emit();
}
