import { Directory, File, Paths } from "expo-file-system";
// The legacy entry: in this version the main entry's save calls throw on purpose.
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";

import { shadeBookDownloadPath } from "@/api/endpoints/shade-book";
import { fetchMedia } from "@/api/media";
import type { ShadeBookPage } from "@/api/types";

import { pictureFileName } from "./book";

/**
 * A Shade Book page's picture to keep: the photo in its colours over every part's Vista
 * code, made by the server (the same picture the website saves). Fetched into the cache
 * with the session — it needs the pass — then saved to the photos or shared. Deleted on
 * sign-out.
 */
function folder(): Directory {
  return new Directory(Paths.cache, "shade-book");
}

/** The picture couldn't be fetched: no signal, or the pass has ended (the book says which). */
export class PictureNotFetched extends Error {
  constructor(message = "The picture couldn't be fetched") {
    super(message);
    this.name = "PictureNotFetched";
  }
}

const FETCH_TIMEOUT_MS = 60_000;

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * The page's picture on a photo as a file on the phone, fetched afresh (it is small, and the
 * pass may have ended).
 */
export async function pictureFile(page: Pick<ShadeBookPage, "id" | "shades">, photo?: { id: string }): Promise<string> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  let bytes: Uint8Array;
  try {
    const res = await fetchMedia(shadeBookDownloadPath(page, photo), abort.signal);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    throw new PictureNotFetched(err instanceof Error ? err.message : undefined);
  } finally {
    clearTimeout(timer);
  }
  if (!isJpeg(bytes)) throw new PictureNotFetched("Not a picture");
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, pictureFileName(page));
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/** Save it to the phone's photos, asking first (write-only). "denied" when the person said no. */
export async function savePictureToPhotos(uri: string): Promise<"saved" | "denied"> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return "denied";
  await MediaLibrary.saveToLibraryAsync(uri);
  return "saved";
}

/** The phone's share sheet with the picture — WhatsApp is in it. */
export async function sharePicture(uri: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("No share sheet");
  await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg", dialogTitle: title });
}

/** Forget every Shade Book picture kept on the phone (sign-out, or a switch of profile). */
export function clearShadeBookFiles(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing kept, or already gone.
  }
}
