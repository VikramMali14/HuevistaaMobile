/**
 * The boards made on this phone: one room's new board never costs another room its own,
 * and a board's files are found again after an update moves the app's documents.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MadeBoard } from "../made-boards";

// The app's documents, as an update can move them: only the folder's own path changes.
const mockDocs = { uri: "file:///var/Containers/Data/Application/NEW-UUID/Documents/" };
const mockExisting = new Set<string>();
jest.mock("expo-file-system", () => {
  const join = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri))
      .reduce((a, b) => `${a.replace(/\/$/, "")}/${b.replace(/^\//, "")}`);
  class Node {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockExisting.has(this.uri);
    }
    delete() {}
    create() {}
    write() {}
    list() {
      return [];
    }
  }
  return { File: Node, Directory: Node, Paths: { document: mockDocs } };
});
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const board = (roomId: string, file: string): MadeBoard => ({
  roomId,
  roomName: roomId,
  file,
  pages: [null],
  swatches: [["#ffffff"]],
  options: 1,
  pageCount: 2,
  madeAt: 1,
});

/** The modules as a new run of the app finds them: nothing in memory, only what was stored. */
function fresh() {
  let made!: typeof import("../made-boards");
  let files!: typeof import("../board-files");
  jest.isolateModules(() => {
    // A fresh copy is the point here, so it is required inside the isolation.
    /* eslint-disable @typescript-eslint/no-require-imports */
    made = require("../made-boards");
    files = require("../board-files");
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return { made, files };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  mockExisting.clear();
  await AsyncStorage.clear();
});

describe("the boards kept on the phone", () => {
  it("adds a new room's board to the ones kept from earlier runs — never in place of them", async () => {
    await AsyncStorage.setItem("hv.madeBoards", JSON.stringify({ bedroom: board("bedroom", "boards/bedroom/1/b.pdf") }));
    const { made } = fresh();
    // Straight from C15, before anything has read the kept boards in.
    made.rememberBoard(board("living", "boards/living/2/l.pdf"));
    await made.madeBoardsLoaded();
    await flush();
    expect(Object.keys(JSON.parse((await AsyncStorage.getItem("hv.madeBoards")) ?? "{}")).sort()).toEqual(["bedroom", "living"]);
  });

  it("forgets a deleted room's board for good, even before the kept ones were read", async () => {
    await AsyncStorage.setItem(
      "hv.madeBoards",
      JSON.stringify({ bedroom: board("bedroom", "boards/bedroom/1/b.pdf"), living: board("living", "boards/living/2/l.pdf") }),
    );
    const { made } = fresh();
    made.forgetBoard("bedroom");
    await made.madeBoardsLoaded();
    await flush();
    expect(Object.keys(JSON.parse((await AsyncStorage.getItem("hv.madeBoards")) ?? "{}"))).toEqual(["living"]);
  });

  it("doesn't bring signed-out boards back from a read still under way", async () => {
    await AsyncStorage.setItem("hv.madeBoards", JSON.stringify({ bedroom: board("bedroom", "boards/bedroom/1/b.pdf") }));
    const { made } = fresh();
    const reading = made.madeBoardsLoaded();
    await made.resetMadeBoards();
    await reading;
    // The next account's first board is the only one kept.
    made.rememberBoard(board("living", "boards/living/2/l.pdf"));
    await flush();
    expect(Object.keys(JSON.parse((await AsyncStorage.getItem("hv.madeBoards")) ?? "{}"))).toEqual(["living"]);
  });
});

describe("where a board's files are", () => {
  it("keeps each file as its place inside the documents, and finds it there", () => {
    const { files } = fresh();
    expect(files.boardUri("boards/p1/9/board.pdf")).toBe(`${mockDocs.uri}boards/p1/9/board.pdf`);
  });

  it("reads a full path kept by an earlier version from its boards folder on", () => {
    const { files } = fresh();
    const old = "file:///var/Containers/Data/Application/OLD-UUID/Documents/boards/p1/9/board.pdf";
    expect(files.boardUri(old)).toBe(`${mockDocs.uri}boards/p1/9/board.pdf`);
    mockExisting.add(`${mockDocs.uri}boards/p1/9/board.pdf`);
    expect(files.boardExists(old)).toBe(true);
  });

  it("leaves any other link as it is", () => {
    const { files } = fresh();
    expect(files.boardUri("content://downloads/board.pdf")).toBe("content://downloads/board.pdf");
  });
});
