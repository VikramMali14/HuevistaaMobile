/**
 * The browser preview's stand-in for board-files.ts: a browser has no app folder, so a
 * board lives as in-memory links for this visit, and "save" and "share" both download it.
 * The app is not shipped on the web; this only lets the screens be walked through.
 */
import type { WrittenBoard } from "./board-files";

/** Each board's links, by its PDF's link; and which board is each room's. */
const kept = new Map<string, string[]>();
const owners = new Map<string, string>();

export async function readSnapshot(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}

function link(bytes: Uint8Array, type: string): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
}

export async function writeBoard(
  _roomId: string,
  _name: string,
  pdf: Uint8Array,
  pictures: readonly (Uint8Array | null)[],
): Promise<WrittenBoard> {
  const file = link(pdf, "application/pdf");
  const pages = pictures.map((bytes) => (bytes ? link(bytes, "image/jpeg") : null));
  kept.set(file, [file, ...pages.filter((p): p is string => Boolean(p))]);
  return { folder: file, file, pages };
}

/** Links are per board; the room's earlier ones are let go once this one is handed over. */
export function keepOnly(roomId: string, board: WrittenBoard): void {
  const previous = owners.get(roomId);
  if (previous && previous !== board.folder) discardBoard({ folder: previous, file: previous, pages: [] });
  owners.set(roomId, board.folder);
}

export function discardRoomBoards(roomId: string): void {
  const folder = owners.get(roomId);
  if (folder) discardBoard({ folder, file: folder, pages: [] });
  owners.delete(roomId);
}

export function discardBoard(board: WrittenBoard): void {
  for (const url of kept.get(board.folder) ?? []) URL.revokeObjectURL(url);
  kept.delete(board.folder);
}

export function boardExists(file: string): boolean {
  return [...kept.values()].some((urls) => urls.includes(file));
}

function download(file: string, title: string) {
  const a = document.createElement("a");
  a.href = file;
  a.download = `${title}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function shareBoard(file: string, title: string): Promise<void> {
  download(file, title);
}

export async function saveBoardToPhone(file: string, title: string): Promise<boolean> {
  download(file, title);
  return true;
}

export function clearBoardFiles(): void {
  for (const urls of kept.values()) for (const url of urls) URL.revokeObjectURL(url);
  kept.clear();
  owners.clear();
}
