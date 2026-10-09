import * as DocumentPicker from "expo-document-picker";

import { t } from "@/i18n";

import type { BoardKind, ReaderErrorCode } from "./board-reader/protocol";
import { readFileBase64, statFile } from "./read-file";

/**
 * A board's file on the phone (P7): what may be read, and what to say when it can't be.
 * Ported from the painter website's lib/board-file.ts: the same 25 MB cap, and the same
 * two kinds (a PDF board, or a photo of its last page).
 */

/** 25 MB. Comfortably above any real colour board and below what will exhaust a phone. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface BoardFile {
  uri: string;
  /** As the painter knows it, for "We couldn't find a board code in …". */
  name: string;
  mime: string;
  /** In bytes, when the phone says; a shared file sometimes doesn't. */
  size: number | null;
}

export type BoardProblem = "tooBig" | "wrongType";

const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;

/** A PDF, a picture, or neither — by its type, else by its name. */
export function boardKindOf(file: Pick<BoardFile, "name" | "mime">): BoardKind | null {
  const mime = file.mime.toLowerCase();
  if (mime === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (mime.startsWith("image/") || IMAGE_NAME.test(file.name)) return "image";
  return null;
}

/** Why this file can't be read, before reading a byte of it — or null. */
export function problemWith(file: BoardFile): BoardProblem | null {
  if (!boardKindOf(file)) return "wrongType";
  if (file.size != null && file.size > MAX_FILE_BYTES) return "tooBig";
  return null;
}

/** What to tell the painter when a file can't be read. */
export function problemMessage(problem: BoardProblem | ReaderErrorCode): string {
  switch (problem) {
    case "tooBig":
      return t("painter.upload.tooBig");
    case "wrongType":
      return t("painter.upload.wrongType");
    case "locked":
      return t("painter.upload.locked");
    case "unreadable":
      return t("painter.upload.unreadable");
    case "image":
      return t("painter.upload.image");
    default:
      return t("painter.upload.failed");
  }
}

/** The painter picks a PDF or a photo. Null when they back out. */
export async function pickBoardFile(): Promise<BoardFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.name || t("painter.upload.thisFile"),
    mime: asset.mimeType ?? "",
    size: typeof asset.size === "number" && asset.size > 0 ? asset.size : null,
  };
}

/** A file another app opened us with ("Open with HueVistaa"). */
export function sharedBoardFile(uri: string): BoardFile {
  const stat = statFile(uri);
  return { uri, name: stat.name || t("painter.upload.thisFile"), mime: stat.mime, size: stat.size };
}

/**
 * The file's bytes in base64, for the reader. Checked against the cap again here, for a
 * file whose size the phone didn't know until it was read.
 */
export async function readBoardFile(file: BoardFile): Promise<{ base64: string } | { problem: BoardProblem | ReaderErrorCode }> {
  let base64: string;
  try {
    base64 = await readFileBase64(file.uri);
  } catch {
    return { problem: "failed" };
  }
  if (!base64) return { problem: "unreadable" };
  if ((base64.length * 3) / 4 > MAX_FILE_BYTES + 2) return { problem: "tooBig" };
  return { base64 };
}
