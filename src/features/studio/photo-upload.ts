import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useSyncExternalStore } from "react";

import { uploadPhoto, type PhotoFile } from "@/api/endpoints/images";
import { isApiError } from "@/api/errors";
import type { UploadedImage } from "@/api/types";

/** C6: the long edge a photo is shrunk to before upload — quick on 4G, always under 10 MB. */
export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;

export interface PreparedPhoto {
  file: PhotoFile;
  width: number;
  height: number;
}

/** The size to shrink to: the long edge at most {@link MAX_EDGE}, never larger than it was. */
export function shrunkSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge || long <= 0) return { width, height };
  const scale = maxEdge / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Shrink and re-encode a picked or taken photo on the phone. */
export async function preparePhoto(uri: string, width: number, height: number): Promise<PreparedPhoto> {
  const target = shrunkSize(width, height);
  const ctx = ImageManipulator.manipulate(uri);
  if (target.width !== width || target.height !== height) {
    ctx.resize(target.width >= target.height ? { width: target.width } : { height: target.height });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return {
    file: { uri: saved.uri, name: `room-${Date.now()}.jpg`, type: "image/jpeg" },
    width: saved.width,
    height: saved.height,
  };
}

export type UploadState =
  | { status: "idle" }
  | { status: "uploading"; photo: PreparedPhoto; progress: number }
  | { status: "done"; photo: PreparedPhoto; image: UploadedImage }
  /** `notRoom`: the backend looked and refused it (422) — retake, don't retry. */
  | { status: "failed"; photo: PreparedPhoto; error: unknown; notRoom: boolean };

let state: UploadState = { status: "idle" };
let attempt = 0;
const listeners = new Set<() => void>();

function set(next: UploadState) {
  state = next;
  for (const l of listeners) l();
}

/**
 * Start uploading a prepared photo (C6 "Use this photo"). C7 opens straight away and
 * watches this; the upload finishes while the room is being named.
 */
export function startUpload(photo: PreparedPhoto) {
  const mine = ++attempt;
  set({ status: "uploading", photo, progress: 0 });
  uploadPhoto(photo.file, (progress) => {
    if (mine === attempt && state.status === "uploading") set({ ...state, progress });
  }).then(
    (image) => mine === attempt && set({ status: "done", photo, image }),
    (error: unknown) =>
      mine === attempt && set({ status: "failed", photo, error, notRoom: isApiError(error) && error.status === 422 }),
  );
}

/** Upload the same photo again (C7 "Try again"). */
export function retryUpload() {
  if (state.status === "failed") startUpload(state.photo);
}

/** Forget the photo (a room was made from it, or it is being retaken). */
export function clearUpload() {
  attempt++;
  set({ status: "idle" });
}

export function getUpload(): UploadState {
  return state;
}

export function useUpload(): UploadState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
