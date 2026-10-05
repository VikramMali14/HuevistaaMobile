import { isApiError } from "@/api/errors";
import type { ColourBoardResult } from "@/api/types";
import { t } from "@/i18n";

/**
 * The order in which a colour board is built, charged for and handed over (C15) — ported
 * from the website's lib/colour-board-download.ts, which owns the reasoning.
 *
 * Charging is one-way on the server (no refund), so nothing that can fail runs after it:
 * the board is built AND written to the phone first. Then the charge, which also records
 * what was on the board. A REPLY is the server's answer and is obeyed, whatever it says —
 * 402 (nothing to pay with) or any other 4xx (the room closed, its boards are spent, the
 * sheet is too big) stops the hand-over. Only SILENCE — no connection, a timeout, a 5xx —
 * fails open: a customer at a counter must not lose their board to a bad signal.
 */
export type BoardRunOutcome =
  /** Handed over. `result` is absent when the charge went unanswered (failed open). */
  | { status: "handed-over"; result?: ColourBoardResult; closed: boolean }
  /** The file could not be made on this phone. Nothing was charged. */
  | { status: "build-failed" }
  /** The paying plan is out of boards. Nothing was handed over. */
  | { status: "quota-spent"; message: string }
  /** The server refused this board for another reason. Nothing was handed over. */
  | { status: "refused"; message: string };

export interface BoardRunSteps<Built> {
  /** Make the file (snapshots, PDF, written to the phone). Throws when it can't. */
  build: () => Promise<Built>;
  /** Charge for the board and record its pages. */
  charge: () => Promise<ColourBoardResult>;
  /** Hand the finished board over — only ever after a charge that was not refused. */
  handOver: (built: Built, result: ColourBoardResult | undefined) => void | Promise<void>;
  /** Throw away a board the server refused (it was built before the charge). */
  discard?: (built: Built) => void;
}

export async function runColourBoard<Built>(steps: BoardRunSteps<Built>): Promise<BoardRunOutcome> {
  let built: Built;
  try {
    built = await steps.build();
  } catch {
    return { status: "build-failed" };
  }

  let result: ColourBoardResult | undefined;
  try {
    result = await steps.charge();
  } catch (e) {
    if (isApiError(e) && e.kind === "http" && e.status >= 400 && e.status < 500) {
      steps.discard?.(built);
      // The server's own sentence; a refusal without one still says something to act on.
      if (e.status === 402) return { status: "quota-spent", message: e.message || t("board.quotaSpent") };
      // A session that ended is not the room refusing: say what will fix it.
      return { status: "refused", message: e.status === 401 ? t("errors.sessionEnded") : e.message || t("board.refused") };
    }
    // Silence — no answer, a timeout, a 5xx: fail open (see above).
  }

  await steps.handOver(built, result);
  return { status: "handed-over", result, closed: Boolean(result?.closed) };
}
