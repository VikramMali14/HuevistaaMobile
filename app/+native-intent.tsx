import { holdSharedBoard, isFileUrl } from "@/features/painter/shared-board";

/**
 * Links from outside, before the router sees them. One kind needs turning round: a PDF
 * another app opened us with (the app is registered for PDFs — app.json), which arrives as
 * a file rather than a link. It goes to P7 to be read for a board's QR. Everything else
 * goes on as it came. Never throws: an error here would stop the app opening at all.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return isFileUrl(path) ? holdSharedBoard(path) : path;
  } catch {
    return path;
  }
}
