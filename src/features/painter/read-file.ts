import { File } from "expo-file-system";

/**
 * Reading a picked or shared file on the phone — a file:// copy from the picker, or the
 * content:// another app opened us with (Android). See read-file.web.ts for the preview.
 */

/** Its name, type and size, as far as the phone knows them. */
export function statFile(uri: string): { name: string; mime: string; size: number | null } {
  try {
    const file = new File(uri);
    let name = file.name;
    try {
      name = decodeURIComponent(name);
    } catch {
      // Kept as it is.
    }
    return { name, mime: file.type ?? "", size: file.size > 0 ? file.size : null };
  } catch {
    return { name: "", mime: "", size: null };
  }
}

export async function readFileBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}
