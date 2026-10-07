import type { ColourBoardPage, RoomDetail } from "@/api/types";
import { t } from "@/i18n";
import type { PdfShade } from "@/lib/pdf-export";

import type { SavedCombo } from "../studio/tray-store";

/** A wall a board can name: its id (as the studio keys it) and what it is called. */
export interface BoardWall {
  id: string;
  label: string;
}

/** One option on the board: what is printed under it, and what the canvas paints. */
export interface BoardOption {
  shades: PdfShade[];
  /** Wall id → its colour, for the snapshot (walls not here are left unpainted). */
  paints: Map<string, { hex: string; lrv: number | null }>;
}

/** The most options a board carries when the allowance can't be read (the backend's own). */
export const DEFAULT_OPTIONS_PER_BOARD = 5;

/** The most walls one page can name — the server refuses a page with more. */
export const MAX_WALLS_PER_PAGE = 16;

/**
 * A saved combination as a page of the board: its walls in the plan's order (main wall
 * first), each with its name and code — the website's `addToPdf`. A wall drawn since
 * the combination was kept has no colour in it and is left off; one removed since is
 * gone. `nameOf` is the shade's name when the scheme shows names, else null, and a
 * colour mixed by hand (no code) is "Custom colour" only where names are shown.
 */
export function boardOption(
  combo: SavedCombo,
  walls: readonly BoardWall[],
  nameOf: (code: string | null) => string | null,
  namesShown: boolean,
): BoardOption {
  const shades: PdfShade[] = [];
  const paints = new Map<string, { hex: string; lrv: number | null }>();
  for (const wall of walls) {
    const colour = combo.colours[wall.id];
    if (!colour) continue;
    const name = nameOf(colour.code) ?? (namesShown && !colour.code ? t("board.customColour") : "");
    shades.push({
      label: wall.label,
      regionId: Number(wall.id),
      rawCode: colour.code ?? undefined,
      name,
      code: colour.code ?? undefined,
      hex: colour.hex,
    });
    paints.set(wall.id, { hex: colour.hex, lrv: colour.lrv ?? null });
  }
  return { shades, paints };
}

/**
 * What is reported with the charge — each page's shades, per wall. The board is built on
 * the phone and the server never sees it, so this is the only record of what went onto
 * paper (the website's `downloadPdf`).
 */
export function recordedPages(options: readonly BoardOption[]): ColourBoardPage[] {
  return options.map((o) => ({
    shades: o.shades.map((s) => ({
      regionId: Number.isFinite(s.regionId) ? (s.regionId ?? null) : null,
      // Within what the server keeps (a longer one is refused, and the board with it).
      regionLabel: s.label.slice(0, 255),
      shadeCode: s.rawCode?.slice(0, 64) ?? null,
      shadeName: s.name ? s.name.slice(0, 160) : null,
      hex: sixDigitHex(s.hex),
    })),
  }));
}

/** "#abc" or "aabbcc" as "#aabbcc" — the only form the server takes. Anything else as it is. */
export function sixDigitHex(hex: string): string {
  const bare = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(bare)) return `#${[...bare].map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/i.test(bare)) return `#${bare}`;
  return hex;
}

/**
 * The board's pages: one per option, and the reward page that closes it — every board of
 * a customer's own room carries one; a ready-made room's carries none (the backend
 * answers its reward code with 204).
 */
export function pageCount(options: number, room: Pick<RoomDetail, "fromLibrary">): number {
  return options + (room.fromLibrary ? 0 : 1);
}

/** Boards this room has left, including the next one; null when the room doesn't say. */
export function boardsLeft(room: Pick<RoomDetail, "boardsUsed" | "boardsAllowed">): number | null {
  const allowed = room.boardsAllowed ?? 0;
  return allowed > 0 ? Math.max(0, allowed - (room.boardsUsed ?? 0)) : null;
}

/** Taking the next board closes the room (it is the room's last). */
export function boardClosesRoom(room: Pick<RoomDetail, "boardsUsed" | "boardsAllowed">): boolean {
  const allowed = room.boardsAllowed ?? 0;
  return allowed > 0 && (room.boardsUsed ?? 0) + 1 >= allowed;
}

/**
 * Why this room can't hand over another board, or null when it can — the website's
 * `boardBlockedReason`, closure first because it is the least guessable.
 */
export function boardBlockedReason(room: Pick<RoomDetail, "closedAt" | "readOnly" | "readOnlyReason" | "boardsUsed" | "boardsAllowed">): string | null {
  if (room.closedAt) return t("board.blockedClosed");
  if (room.readOnly) return room.readOnlyReason?.trim() || t("board.blockedViewOnly");
  const allowed = room.boardsAllowed ?? 0;
  if (allowed > 0 && (room.boardsUsed ?? 0) >= allowed) {
    return allowed === 1 ? t("board.blockedSpentOne") : t("board.blockedSpent", { n: allowed });
  }
  return null;
}

/** Move one option up or down the board; out of range leaves the list as it was. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** "Living room" → "living-room" (for a file name); nothing usable left → "room". */
export function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "room";
}
