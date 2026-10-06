import { Directory, File, Paths } from "expo-file-system";
// The legacy entry: in this version the main entry's save calls throw on purpose.
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { Linking } from "react-native";

import { fetchMedia } from "@/api/media";
import { fileSlug } from "@/features/boards/board-pages";

/**
 * An AI image on the phone (C24): fetched once into the cache, then saved to the photos,
 * shared, or put on a PDF with its shades. The picture's address is signed and expires
 * within the hour, so it is never what is shared — the file is. Deleted on sign-out.
 */
function folder(): Directory {
  return new Directory(Paths.cache, "ai-images");
}

/** An image id as a file name (ids are UUIDs; anything else is made safe). */
function nameOf(renderId: string): string {
  return renderId.replace(/[^A-Za-z0-9_-]/g, "_") || "image";
}

/**
 * The image as a file on the phone, fetched the first time. Throws when the picture can't
 * be fetched (its signed address may have expired: read the image again for a fresh one).
 */
export async function renderFile(url: string, renderId: string): Promise<string> {
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${nameOf(renderId)}.jpg`);
  if (file.exists) return file.uri;
  const res = await fetchMedia(url);
  const type = res.headers.get("content-type") ?? "";
  if (type && !type.toLowerCase().startsWith("image/")) throw new Error("Not a picture");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error("Empty picture");
  // Written beside its name and moved into place whole, so a half-fetched file never
  // passes for the image.
  const part = new File(dir, `${nameOf(renderId)}.part`);
  part.create({ overwrite: true });
  part.write(bytes);
  await part.move(file);
  return file.uri;
}

export async function renderBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/**
 * Save the image to the phone's photos, asking first (only now — the product asks for a
 * permission when it is needed). "denied" when the person said no: Settings can change it.
 */
export async function saveRenderToPhotos(uri: string): Promise<"saved" | "denied"> {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
  if (!permission.granted) return "denied";
  await MediaLibrary.saveToLibraryAsync(uri);
  return "saved";
}

export function openPhotoSettings(): void {
  void Linking.openSettings().catch(() => {});
}

/** The phone's share sheet with the picture — WhatsApp is in it. */
export async function shareRender(uri: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("No share sheet");
  await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg", dialogTitle: title });
}

/** Write the image's one-page PDF beside it, and open the share sheet with it. */
export async function sharePdf(pdf: Uint8Array, renderId: string, roomName: string, title: string): Promise<void> {
  const dir = new Directory(folder(), nameOf(renderId));
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `HueVistaa-AI-image-${fileSlug(roomName)}.pdf`);
  file.create({ overwrite: true });
  file.write(pdf);
  if (!(await Sharing.isAvailableAsync())) throw new Error("No share sheet");
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: title });
}

/** Forget every AI image kept on the phone (sign-out, or a switch of profile). */
export function clearRenderFiles(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing kept, or already gone.
  }
}
