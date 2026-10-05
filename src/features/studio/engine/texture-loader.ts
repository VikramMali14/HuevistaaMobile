import { File, Paths } from "expo-file-system";
import { Image } from "react-native";

import { fetchMedia } from "@/api/media";

import type { TextureSource } from "./recolor-gl";

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
 * A backend picture as a texture source on a phone: fetched once into the cache (with
 * the session for the backend's own files), then handed to expo-gl as `{ localUri }`,
 * which decodes it on the GL thread. `cacheKey` names the picture across signed links
 * that change on every response; a new key fetches again.
 */
export async function loadTexture(url: string, cacheKey: string = url): Promise<TextureSource> {
  const file = new File(Paths.cache, cacheName(cacheKey));
  if (!file.exists) {
    const res = await fetchMedia(url);
    file.create({ overwrite: true });
    file.write(new Uint8Array(await res.arrayBuffer()));
  }
  const { width, height } = await sizeOf(file.uri);
  return { pixels: { localUri: file.uri }, width, height };
}

/** A picture bundled with the app (the engine check's sample room). */
export async function loadBundledTexture(uri: string, width: number, height: number): Promise<TextureSource> {
  return { pixels: { localUri: uri }, width, height };
}
