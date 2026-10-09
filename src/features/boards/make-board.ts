import { projectsApi } from "@/api/endpoints/projects";
import { boardChanges } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { RoomDetail } from "@/api/types";
import { tEn } from "@/i18n";
import { pdfPrintable } from "@/lib/pdf-core";
import { buildColourBoardPdf } from "@/lib/pdf-export";

import { forgetTray } from "../studio/tray-store";
import type { SnapshotPaint } from "../studio/engine/RoomCanvas";
import { discardBoard, keepOnly, readSnapshot, writeBoard, type WrittenBoard } from "./board-files";
import { pageCount, recordedPages, type BoardOption } from "./board-pages";
import { runColourBoard, type BoardRunOutcome } from "./board-run";
import { rememberBoard } from "./made-boards";
import { buildRewardQr } from "./reward-qr";

export interface MakeBoardInput {
  room: Pick<RoomDetail, "id" | "name" | "fromLibrary">;
  options: readonly BoardOption[];
  /** Photograph the room in one option's colours; null when the canvas can't (no live colour). */
  snapshot: ((paints: ReadonlyMap<string, SnapshotPaint>) => Promise<string | null>) | null;
  /** The codes can be read at any HueVistaa shop (HV codes) — decides the footer's line. */
  universalCodes: boolean;
  /** Each step as it starts, for the working state: "start", "photo" n of total, "file", then "charge". */
  onStep?: (step: BoardStep) => void;
}

export type BoardStep = { kind: "start" } | { kind: "photo"; n: number; total: number } | { kind: "file" } | { kind: "charge" };

/** A page's picture, or null (swatches) when it can't be taken. One bad page never sinks the board. */
async function photograph(input: MakeBoardInput, option: BoardOption): Promise<Uint8Array | null> {
  if (!input.snapshot) return null;
  try {
    const uri = await input.snapshot(option.paints);
    return uri ? await readSnapshot(uri) : null;
  } catch {
    return null;
  }
}

/**
 * C15 · Make my colour board, in the order the money rule sets (07 "The colour board PDF",
 * board-run.ts): the reward code, the board built and written to the phone, the charge
 * (which records each page), and only then the hand-over — remembered for C16, and the
 * room, the room list and the Boards tab read again (not waited for: C16 needs none of
 * them). The tray is emptied only once the server has recorded the board; a board handed
 * over on a charge that went unanswered keeps it, so the options can be made again.
 */
export async function makeBoard(input: MakeBoardInput): Promise<BoardRunOutcome> {
  const { room, options } = input;
  const name = room.name?.trim() || tEn("rooms.untitled");
  // The board's fonts print Latin letters only; a name in another script would print as "????".
  const printedName = pdfPrintable(name) ? name : tEn("board.pdfTitle");
  return runColourBoard<{ written: WrittenBoard; pages: number; rewardMissing: boolean }>({
    build: async () => {
      input.onStep?.({ kind: "start" });
      const reward = await buildRewardQr(room.id);
      const pictures: (Uint8Array | null)[] = [];
      for (let i = 0; i < options.length; i++) {
        input.onStep?.({ kind: "photo", n: i + 1, total: options.length });
        pictures.push(await photograph(input, options[i]!));
      }
      input.onStep?.({ kind: "file" });
      const pdf = buildColourBoardPdf(
        options.map((o, i) => ({ jpeg: pictures[i] ?? null, shades: o.shades })),
        printedName,
        input.universalCodes,
        null,
        undefined,
        reward,
      );
      return {
        written: await writeBoard(room.id, name, pdf, pictures),
        pages: options.length + (reward ? 1 : 0),
        rewardMissing: !reward && pageCount(options.length, room) > options.length,
      };
    },
    charge: () => {
      input.onStep?.({ kind: "charge" });
      return projectsApi.recordBoard(room.id, recordedPages(options));
    },
    discard: ({ written }) => discardBoard(written),
    handOver: async ({ written, pages, rewardMissing }, result) => {
      keepOnly(room.id, written);
      rememberBoard({
        roomId: room.id,
        roomName: name,
        file: written.file,
        pages: written.pages,
        swatches: options.map((o) => o.shades.map((s) => s.hex)),
        options: options.length,
        pageCount: pages,
        madeAt: Date.now(),
        unrecorded: !result,
        closedRoom: Boolean(result?.closed),
        rewardMissing,
      });
      if (result) forgetTray(room.id);
      void Promise.all(boardChanges(room.id).map((queryKey) => queryClient.invalidateQueries({ queryKey }))).catch(() => {});
    },
  });
}
