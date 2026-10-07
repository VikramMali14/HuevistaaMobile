/**
 * Reading a picked file in the web preview: the picker hands back a blob: (or data:) URL.
 * Nothing is ever shared into a browser tab, so there is nothing to stat.
 */

export function statFile(): { name: string; mime: string; size: number | null } {
  return { name: "", mime: "", size: null };
}

export async function readFileBase64(uri: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  let binary = "";
  // In slices: one call with millions of arguments overflows the stack.
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}
