import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { shrunkSize } from "@/features/studio/photo-upload";
import { evenLighting } from "@/lib/surface-sample";

import { decodePng, type Pixels } from "./png";

/**
 * The long edge a photo is READ at. A tap on a phone screen is a fingertip wide, and
 * `samplePatch` averages the surface around it anyway, so this is plenty — and small enough
 * to decode and even out in a moment.
 */
export const SAMPLE_EDGE = 480;
/** The long edge it is SHOWN at: sharp on a phone's screen, light on its memory. */
export const SHOW_EDGE = 1440;

/** A photo in the Colour finder: the picture to show, and the pixels a tap reads. */
export interface FinderPhoto {
  /** The photo, shrunk and the right way up. */
  uri: string;
  /** The same photo, smaller, as pixels — the same way up and the same shape as `uri`. */
  pixels: Pixels;
  /** Those pixels with the lighting evened out, worked out once rather than per tap. */
  even: Uint8ClampedArray;
}

/**
 * Read a picked or taken photo for the Colour finder. The phone has no canvas to read pixels
 * back from, so the photo is shrunk and saved as a PNG on the phone and its bytes decoded
 * (png.ts); nothing leaves the phone. Both renders come from the same photo the same way, so a
 * tap on the one shown lands on the same spot of the one read.
 */
export async function readFinderPhoto(uri: string, width: number, height: number): Promise<FinderPhoto> {
  const shown = await render(uri, width, height, SHOW_EDGE, "jpeg");
  const read = await render(uri, width, height, SAMPLE_EDGE, "png");
  const pixels = decodePng(await new File(read).bytes());
  return { uri: shown, pixels, even: evenLighting(pixels.data, pixels.width, pixels.height) };
}

async function render(uri: string, width: number, height: number, edge: number, as: "jpeg" | "png"): Promise<string> {
  const target = shrunkSize(width, height, edge);
  const ctx = ImageManipulator.manipulate(uri);
  if (target.width !== width || target.height !== height) {
    ctx.resize(target.width >= target.height ? { width: target.width } : { height: target.height });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync(as === "jpeg" ? { compress: 0.85, format: SaveFormat.JPEG } : { format: SaveFormat.PNG });
  return saved.uri;
}
