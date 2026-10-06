/**
 * The browser preview's stand-in for render-files.ts: a browser has no app folder or
 * photo library, so an image lives as an in-memory link for this visit, and save, share
 * and the PDF all download it. The app is not shipped on the web; this only lets the
 * screens be walked through.
 */
import { fetchMedia } from "@/api/media";
import { fileSlug } from "@/features/boards/board-pages";

const kept = new Map<string, string>();

export async function renderFile(url: string, renderId: string): Promise<string> {
  const known = kept.get(renderId);
  if (known) return known;
  const res = await fetchMedia(url);
  const link = URL.createObjectURL(await res.blob());
  kept.set(renderId, link);
  return link;
}

export async function renderBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function saveRenderToPhotos(uri: string): Promise<"saved" | "denied"> {
  download(uri, "HueVistaa-AI-image.jpg");
  return "saved";
}

export function openPhotoSettings(): void {}

export async function shareRender(uri: string, _title: string): Promise<void> {
  download(uri, "HueVistaa-AI-image.jpg");
}

export async function sharePdf(pdf: Uint8Array, _renderId: string, roomName: string, _title: string): Promise<void> {
  const link = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
  download(link, `HueVistaa-AI-image-${fileSlug(roomName)}.pdf`);
  setTimeout(() => URL.revokeObjectURL(link), 60_000);
}

export function clearRenderFiles(): void {
  for (const link of kept.values()) URL.revokeObjectURL(link);
  kept.clear();
}
