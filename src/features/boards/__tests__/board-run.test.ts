/**
 * Ported from HueVistaFrontEnd/src/lib/__tests__/colour-board-download.test.ts: the order
 * a colour board is built, charged for and handed over in — and where it fails open.
 */
import { ApiError } from "@/api/errors";
import type { ColourBoardResult, PdfAllowance } from "@/api/types";

import { runColourBoard, type BoardRunSteps } from "../board-run";

const allowance: PdfAllowance = { imagesPerPdf: 5, monthlyLimit: 100, used: 1, remaining: 99, unlimited: true };
/** A board that left the room with one still to give. */
const result: ColourBoardResult = { allowance, boardsUsed: 1, boardsAllowed: 2, closed: false };
/** The board that finished the job. */
const closingResult: ColourBoardResult = { ...result, boardsUsed: 2, closed: true };

function steps(overrides: Partial<BoardRunSteps<string>> = {}) {
  return {
    build: jest.fn(async () => "board.pdf"),
    charge: jest.fn(async () => result),
    handOver: jest.fn(),
    discard: jest.fn(),
    ...overrides,
  };
}

describe("runColourBoard", () => {
  it("builds the file before charging for it, and hands it over last", async () => {
    const order: string[] = [];
    const s = steps({
      build: jest.fn(async () => {
        order.push("build");
        return "board.pdf";
      }),
      charge: jest.fn(async () => {
        order.push("charge");
        return result;
      }),
      handOver: jest.fn(() => void order.push("hand over")),
    });

    expect(await runColourBoard(s)).toEqual({ status: "handed-over", result, closed: false });
    expect(order).toEqual(["build", "charge", "hand over"]);
    expect(s.handOver).toHaveBeenCalledWith("board.pdf", result);
  });

  it("charges nothing when the file cannot be made", async () => {
    // A charge only ever goes up — there is no refund — so a board that fails to build on
    // a low-memory phone must not cost the customer their board.
    const s = steps({
      build: jest.fn(async () => {
        throw new Error("out of memory");
      }),
    });

    expect(await runColourBoard(s)).toEqual({ status: "build-failed" });
    expect(s.charge).not.toHaveBeenCalled();
    expect(s.handOver).not.toHaveBeenCalled();
  });

  it("withholds the board, and throws it away, when there is nothing to pay with", async () => {
    const s = steps({
      charge: jest.fn(async () => {
        throw new ApiError("http", 402, "Monthly PDF download limit reached (5).");
      }),
    });

    expect(await runColourBoard(s)).toEqual({ status: "quota-spent", message: "Monthly PDF download limit reached (5)." });
    expect(s.handOver).not.toHaveBeenCalled();
    expect(s.discard).toHaveBeenCalledWith("board.pdf");
  });

  it.each([
    ["no connection", new ApiError("network", 0, "Network error")],
    ["a timeout", new ApiError("timeout", 0, "Request timed out")],
    ["a server that fell over", new ApiError("http", 503, "")],
  ])("hands the board over anyway on %s (silence fails open)", async (_case, error) => {
    const s = steps({
      charge: jest.fn(async () => {
        throw error;
      }),
    });

    expect(await runColourBoard(s)).toEqual({ status: "handed-over", result: undefined, closed: false });
    expect(s.handOver).toHaveBeenCalledWith("board.pdf", undefined);
    expect(s.discard).not.toHaveBeenCalled();
  });

  it("says so when the board closed the room, and still hands it over", async () => {
    const s = steps({ charge: jest.fn(async () => closingResult) });

    expect(await runColourBoard(s)).toEqual({ status: "handed-over", result: closingResult, closed: true });
    expect(s.handOver).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a closed room", 409, "This room is closed. Reopen it to make another colour board."],
    ["a room with no boards left", 409, "This room has already handed over all 1 of its colour board."],
    ["a sheet bigger than the allowance", 409, "A colour board here carries up to 5 colours — this one has 6."],
    ["a request the server would not take", 400, "Bad request."],
    ["a session that ended", 401, "Please sign in again."],
  ])("refuses to hand over the board on %s", async (_case, status, message) => {
    const s = steps({
      charge: jest.fn(async () => {
        throw new ApiError("http", status, message);
      }),
    });

    expect(await runColourBoard(s)).toEqual({ status: "refused", message });
    expect(s.handOver).not.toHaveBeenCalled();
    expect(s.discard).toHaveBeenCalledTimes(1);
  });

  it("says to sign in again when the session ended, whatever the server wrote", async () => {
    const s = steps({
      charge: jest.fn(async () => {
        throw new ApiError("http", 401, "");
      }),
    });

    expect(await runColourBoard(s)).toEqual({ status: "refused", message: "Please sign in again." });
  });

  it("falls back to its own words when a refusal carries none", async () => {
    const s = steps({
      charge: jest.fn(async () => {
        throw new ApiError("http", 409, "");
      }),
    });

    expect(await runColourBoard(s)).toEqual({ status: "refused", message: "This room can't hand over another colour board." });
  });
});
