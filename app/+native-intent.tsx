import { holdSharedBoard, isFileUrl } from "@/features/painter/shared-board";

/** The website's own links the app is registered for (App Links — app.json): a board's QR and a shared room. */
const OUR_LINK = /^https:\/\/huevistaa\.com\/(r|share)\/([A-Za-z0-9_-]{16,64})\/?(?:[?#].*)?$/i;

/**
 * Links from outside, before the router sees them. Two kinds need turning round:
 * - a PDF another app opened us with (the app is registered for PDFs), which arrives as a
 *   file rather than a link. It goes to P7 to be read for a board's QR;
 * - the website's own link to a board (D1) or a shared room (D2), opened from a QR, a chat
 *   or a PDF. It goes to the same screen here — without what came after the path (a
 *   campaign tag, a fragment), which would otherwise ride along as the screen's params.
 * Everything else goes on as it came. Never throws: an error here would stop the app
 * opening at all. The link itself is never logged — its code is the whole secret.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (isFileUrl(path)) return holdSharedBoard(path);
    const ours = OUR_LINK.exec(path.trim());
    if (ours) return `/${ours[1]!.toLowerCase()}/${ours[2]}`;
    return path;
  } catch {
    return path;
  }
}
