import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { fileSlug } from "./board-pages";

/**
 * Colour boards on the phone (C15, C16, C25): the PDF and a picture of each page, kept in
 * a folder per room so a board can be sent again later. Kept in the app's documents (not
 * the cache, which Android may empty), and deleted on sign-out.
 */
function root(): Directory {
  return new Directory(Paths.document, "boards");
}

/** The bytes of a GL snapshot (a JPEG in the cache). */
export async function readSnapshot(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

export interface WrittenBoard {
  /** The folder this board's files are in. */
  folder: string;
  /** The PDF. */
  file: string;
  /** A picture of each option's page, in order; null where it printed swatches. */
  pages: (string | null)[];
}

function roomFolder(roomId: string): Directory {
  return new Directory(root(), encodeURIComponent(roomId));
}

/**
 * Write a board — the PDF and its page pictures — into a folder of its own. It is built
 * BEFORE it is charged for, so it must not touch the room's last board: that goes only
 * once this one is handed over ({@link keepOnly}), and a refused one is thrown away
 * ({@link discardBoard}).
 */
export async function writeBoard(
  roomId: string,
  name: string,
  pdf: Uint8Array,
  pictures: readonly (Uint8Array | null)[],
): Promise<WrittenBoard> {
  const folder = new Directory(roomFolder(roomId), String(Date.now()));
  folder.create({ intermediates: true, idempotent: true });
  const pdfFile = new File(folder, `HueVistaa-colour-board-${fileSlug(name)}.pdf`);
  pdfFile.create({ overwrite: true });
  pdfFile.write(pdf);
  const pages = pictures.map((bytes, i) => {
    if (!bytes) return null;
    const page = new File(folder, `page-${i + 1}.jpg`);
    page.create({ overwrite: true });
    page.write(bytes);
    return page.uri;
  });
  return { folder: folder.uri, file: pdfFile.uri, pages };
}

/** The board was handed over: the room's earlier boards on this phone go. */
export function keepOnly(roomId: string, board: WrittenBoard): void {
  try {
    for (const entry of roomFolder(roomId).list()) {
      if (entry instanceof Directory && entry.uri.replace(/\/$/, "") !== board.folder.replace(/\/$/, "")) entry.delete();
    }
  } catch {
    // Old boards left behind cost space, not correctness.
  }
}

/** The server refused the board: nothing of it stays. */
export function discardBoard(board: WrittenBoard): void {
  try {
    new Directory(board.folder).delete();
  } catch {
    // Already gone.
  }
}

/** Every board of a room on this phone (the room was deleted). */
export function discardRoomBoards(roomId: string): void {
  try {
    const folder = roomFolder(roomId);
    if (folder.exists) folder.delete();
  } catch {
    // Already gone.
  }
}

/** Whether a board written earlier is still on the phone. */
export function boardExists(file: string): boolean {
  try {
    return new File(file).exists;
  } catch {
    return false;
  }
}

/** Open the phone's share sheet with the board (WhatsApp, email, Drive…). */
export async function shareBoard(file: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("No share sheet");
  await Sharing.shareAsync(file, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: title });
}

/**
 * Keep a copy where the person chooses. On Android that is a folder they pick (Downloads,
 * usually) — PDFs are not photos, so the gallery is no place for one; elsewhere the share
 * sheet's "Save to Files" does it. False when they backed out of choosing.
 */
export async function saveBoardToPhone(file: string, title: string): Promise<boolean> {
  if (Platform.OS !== "android") {
    await shareBoard(file, title);
    return true;
  }
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  const source = new File(file);
  const copy = folder.createFile(source.name, "application/pdf");
  copy.write(await source.bytes());
  return true;
}

/** Forget every board on this phone (sign-out). */
export function clearBoardFiles(): void {
  try {
    const dir = root();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing kept, or already gone.
  }
}
