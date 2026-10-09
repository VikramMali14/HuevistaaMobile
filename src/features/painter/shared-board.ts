/**
 * A board another app opened us with — "Open with HueVistaa" on a PDF in WhatsApp or Files
 * (P7). app/+native-intent.tsx holds the file here and sends the painter to P7, which takes
 * it. Held in memory only: it's a moment's hand-over, not something to keep.
 */

let held: string | null = null;
let count = 0;

/** A file URL rather than a link into the app: content:// (Android) or file:// (iOS's copy). */
export function isFileUrl(url: string): boolean {
  return /^(content|file):\/\//i.test(url.trim());
}

/** Holds the file and says where to go: P7, marked so that a second file is seen as new. */
export function holdSharedBoard(uri: string): string {
  held = uri.trim();
  count += 1;
  return `/painter/upload-board?shared=${count}`;
}

/** The held file, once. */
export function takeSharedBoard(): string | null {
  const uri = held;
  held = null;
  return uri;
}
