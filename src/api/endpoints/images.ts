/**
 * Photo upload. Backend: image/controller/ImageController (POST /api/images/upload,
 * multipart field `file`, 10 MB; 422 when the picture is not a room or a building).
 * Screens: C6, C7.
 */
import { Platform } from "react-native";

import { env } from "@/config/env";

import { ApiError } from "../errors";
import { tokens } from "../instance";
import type { ErrorBody, UploadedImage } from "../types";

export interface PhotoFile {
  uri: string;
  name: string;
  type: string;
}

const UPLOAD_TIMEOUT_MS = 120_000;

async function formFor(file: PhotoFile): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    // The browser's picker hands back a blob: or data: link; the form wants the bytes.
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", blob, file.name);
  } else {
    // React Native reads the file itself from { uri, name, type }.
    form.append("file", file as unknown as Blob);
  }
  return form;
}

function send(
  form: FormData,
  token: string | null,
  onProgress?: (fraction: number) => void,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${env.apiOrigin}/api/images/upload`);
    xhr.setRequestHeader("Accept", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new ApiError("network", 0, "Network error"));
    xhr.ontimeout = () => reject(new ApiError("timeout", 0, "Request timed out"));
    xhr.send(form);
  });
}

/**
 * Upload a room photo, reporting progress 0..1. The photo should already be shrunk on
 * the phone (C6: long edge 2048 px, JPEG 0.85) so it is quick on 4G and under 10 MB.
 */
export async function uploadPhoto(file: PhotoFile, onProgress?: (fraction: number) => void): Promise<UploadedImage> {
  const used = tokens.accessToken;
  let res = await send(await formFor(file), used, onProgress);
  if (res.status === 401 && tokens.hasSession()) {
    const current = tokens.accessToken;
    const fresh = current && current !== used ? current : await tokens.refreshOnce();
    // A form is read once; build it again for the retry.
    if (fresh) res = await send(await formFor(file), fresh, onProgress);
  }
  let body: unknown;
  try {
    body = res.body ? JSON.parse(res.body) : undefined;
  } catch {
    body = undefined;
  }
  if (res.status < 200 || res.status >= 300) {
    const err = (body ?? {}) as ErrorBody;
    const message = typeof err.message === "string" ? err.message.trim() : "";
    throw new ApiError("http", res.status, message, err.fieldErrors, err.code);
  }
  return body as UploadedImage;
}
