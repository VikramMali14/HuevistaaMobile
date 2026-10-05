import { projectsApi } from "@/api/endpoints/projects";
import { boardChanges } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { RoomDetail } from "@/api/types";
import { t } from "@/i18n";
import { buildColourBoardPdf } from "@/lib/pdf-export";

import { forgetTray } from "../studio/tray-store";
import type { SnapshotPaint } from "../studio/engine/RoomCanvas";
import { discardBoard, keepOnly, readSnapshot, writeBoard, type WrittenBoard } from "./board-files";
import { recordedPages, type BoardOption } from "./board-pages";
import { runColourBoard, type BoardRunOutcome } from "./board-run";
import { rememberBoard } from "./made-boards";
import { buildRewardQr } from "./reward-qr";

export interface MakeBoardInput {
  room: Pick<RoomDetail, "id" | "name">;
  options: readonly BoardOption[];
  /** Photograph the room in one option's colours; null when the canvas can't (no live colour). */
  snapshot: ((paints: ReadonlyMap<string, SnapshotPaint>) => Promise<string | null>) | null;
  /** The codes can be read at any HueVistaa shop (HV codes) — decides the footer's line. */
  universalCodes: boolean;
  /** Each step as it starts, for the working state: "photo" n of total, then "file", then "charge". */
  onStep?: (step: { kind: "photo"; n: number; total: number } | { kind: "file" } | { kind: "charge" }) => void;
}

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
 * (which records each page), and only then the hand-over — remembered for C16, the tray
 * emptied, and the room, the room list and the Boards tab read again.
 */
export async function makeBoard(input: MakeBoardInput): Promise<BoardRunOutcome> {
  const { room, options } = input;
  const name = room.name?.trim() || t("rooms.untitled");
  return runColourBoard<{ written: WrittenBoard; pages: number }>({
    build: async () => {
      const reward = await buildRewardQr(room.id);
      const pictures: (Uint8Array | null)[] = [];
      for (let i = 0; i < options.length; i++) {
        input.onStep?.({ kind: "photo", n: i + 1, total: options.length });
        pictures.push(await photograph(input, options[i]!));
      }
      input.onStep?.({ kind: "file" });
      const pdf = buildColourBoardPdf(
        options.map((o, i) => ({ jpeg: pictures[i] ?? null, shades: o.shades })),
        name,
        input.universalCodes,
        null,
        undefined,
        reward,
      );
      return { written: await writeBoard(room.id, name, pdf, pictures), pages: options.length + (reward ? 1 : 0) };
    },
    charge: () => {
      input.onStep?.({ kind: "charge" });
      return projectsApi.recordBoard(room.id, recordedPages(options));
    },
    discard: ({ written }) => discardBoard(written),
    handOver: async ({ written, pages }, result) => {
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
      });
      forgetTray(room.id);
      await Promise.all(boardChanges(room.id).map((queryKey) => queryClient.invalidateQueries({ queryKey }))).catch(() => {});
    },
  });
}
