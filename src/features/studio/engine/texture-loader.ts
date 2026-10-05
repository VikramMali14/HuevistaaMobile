import { Directory, File, Paths } from "expo-file-system";
import { Image } from "react-native";

import { fetchMedia } from "@/api/media";

import type { TextureSource } from "./recolor-gl";

/** The studio's pictures (room photos, wall masks) live in a folder of their own, cleared on sign-out. */
function folder(): Directory {
  return new Directory(Paths.cache, "studio");
}

/** File names in the cache: the picture's address without its (changing) signature. */
function cacheName(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `studio-${(h >>> 0).toString(36)}`;
}

function sizeOf(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

/**
 * Fetch a picture into the cache. Written beside its name and moved into place only when
 * whole, so an app closed mid-download never leaves a broken file that looks cached.
 */
async function download(url: string, file: File): Promise<void> {
  const res = await fetchMedia(url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const part = new File(dir, `${file.name}.part`);
  part.create({ overwrite: true });
  part.write(bytes);
  await part.move(file);
}

/**
 * A backend picture as a texture source on a phone: fetched once into the cache (with
 * the session for the backend's own files), then handed to expo-gl as `{ localUri }`,
 * which decodes it on the GL thread. `cacheKey` names the picture across signed links
 * that change on every response; a new key fetches again. A cached file that can't be
 * read is fetched again, once.
 */
export async function loadTexture(url: string, cacheKey: string = url): Promise<TextureSource> {
  const file = new File(folder(), cacheName(cacheKey));
  if (!file.exists) await download(url, file);
  try {
    const { width, height } = await sizeOf(file.uri);
    return { pixels: { localUri: file.uri }, width, height };
  } catch {
    file.delete();
    await download(url, file);
    const { width, height } = await sizeOf(file.uri);
    return { pixels: { localUri: file.uri }, width, height };
  }
}

/** A picture bundled with the app (the engine check's sample room). */
export async function loadBundledTexture(uri: string, width: number, height: number): Promise<TextureSource> {
  return { pixels: { localUri: uri }, width, height };
}

/** Forget every studio picture on this phone (sign-out: the next person's rooms are their own). */
export function clearStudioCache(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing cached, or the cache is already gone.
  }
}
