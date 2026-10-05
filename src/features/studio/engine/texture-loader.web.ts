import { fetchMedia } from "@/api/media";

import type { TextureSource } from "./recolor-gl";

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The picture could not be read"));
    img.src = src;
  });
}

/**
 * A backend picture as a texture source in the browser: fetched with the session (so a
 * signed-in file route works without a cookie) and decoded into an <img>. The web build
 * is a preview of the app; the browser caches the bytes itself.
 */
export async function loadTexture(url: string, _cacheKey?: string): Promise<TextureSource> {
  const blob = await (await fetchMedia(url)).blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await decode(objectUrl);
    return { pixels: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** A picture bundled with the app (the engine check's sample room). */
export async function loadBundledTexture(uri: string, _width: number, _height: number): Promise<TextureSource> {
  const img = await decode(uri);
  return { pixels: img, width: img.naturalWidth, height: img.naturalHeight };
}
