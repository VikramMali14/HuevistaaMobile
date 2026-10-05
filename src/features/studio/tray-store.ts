import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import type { Colours, WallColour } from "./paint-store";

/**
 * The board tray (C11 "Save this combination"): colourings kept on the phone until a
 * colour board is made from them (C15, Phase 4) — the website keeps its tray in the
 * browser too.
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
  trays = { ...trays, [roomId]: [...list, { colours: picked, savedAt: Date.now() }] };
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify(trays)).catch(() => {});
  return true;
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


/** Forget every tray (sign-out). */
export function resetTrays() {
  trays = {};
  emit();
}
