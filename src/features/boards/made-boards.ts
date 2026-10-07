import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { boardExists, clearBoardFiles, discardRoomBoards } from "./board-files";

/**
 * The boards made on this phone (C16, and C25's "Send the board again"): where the file
 * is, a picture of each page, and what was on it. The server keeps the shades, never the
 * file, so a board made elsewhere has no entry here.
 */
export interface MadeBoard {
  roomId: string;
  roomName: string;
  /** The PDF, as its place on the phone — {@link boardUri} says where that is now. */
  file: string;
  /** A picture of each option's page, in order (as `file`); null where it printed swatches. */
  pages: (string | null)[];
  /** Each option's colours, in order — what a page with no picture shows. */
  swatches: string[][];
  options: number;
  /** Every page, the reward page included. */
  pageCount: number;
  madeAt: number;
  /** The charge went unanswered and the board was handed over anyway (failed open). */
  unrecorded?: boolean;
  /** This board was the room's last: the room has closed. */
  closedRoom?: boolean;
  /** The room's board should have closed with the reward page, and it couldn't be fetched. */
  rewardMissing?: boolean;
}

const KEY = "hv.madeBoards";
let boards: Record<string, MadeBoard> = {};
let loaded: Promise<void> | null = null;
/** Bumped by a reset, so a read still under way can't bring old boards back. */
let generation = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  void AsyncStorage.setItem(KEY, JSON.stringify(boards)).catch(() => {});
}

function load(): Promise<void> {
  const at = generation;
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const stored = JSON.parse(raw ?? "{}") as Record<string, MadeBoard>;
      if (at === generation && stored && typeof stored === "object") {
        boards = { ...stored, ...boards };
        emit();
      }
    })
    .catch(() => {});
  return loaded;
}

/**
 * Kept straight away for C16, and written only once the boards of earlier runs are read
 * in — written before, it would replace every other room's board with this one.
 */
export function rememberBoard(board: MadeBoard) {
  boards = { ...boards, [board.roomId]: board };
  emit();
  void load().then(persist);
}

/** This room's board made on this phone, while its file is still here. */
export function useMadeBoard(roomId: string): MadeBoard | null {
  void load();
  const board = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => boards[roomId] ?? null,
    () => boards[roomId] ?? null,
  );
  return board && boardExists(board.file) ? board : null;
}

/** Wait for the boards kept from an earlier run (C16 opened straight after a restart). */
export function madeBoardsLoaded(): Promise<void> {
  return load();
}

/** Forget one room's board, and its files (the room was deleted). */
export function forgetBoard(roomId: string) {
  discardRoomBoards(roomId);
  // After the read, so the stored entry is forgotten too rather than read back in.
  void load().then(() => {
    if (!(roomId in boards)) return;
    const { [roomId]: _gone, ...rest } = boards;
    boards = rest;
    emit();
    persist();
  });
}

/** Forget every board and its files (sign-out, or a switch of profile). */
export async function resetMadeBoards(): Promise<void> {
  generation += 1;
  boards = {};
  loaded = Promise.resolve();
  emit();
  clearBoardFiles();
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
