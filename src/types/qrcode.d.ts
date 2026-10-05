/**
 * The core of `qrcode` (the library the website prints its boards' QR with), imported on
 * its own: the package's entry point pulls in Node-only renderers. Only the part used
 * here is declared — the symbol's module grid.
 */
declare module "qrcode/lib/core/qrcode" {
  export interface QrSymbol {
    modules: { readonly size: number; get(row: number, col: number): number | boolean };
  }
  export function create(text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }): QrSymbol;
}
