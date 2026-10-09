/**
 * The board reader (P7), the part that runs in the page.
 *
 * It runs in a hidden WebView (a sandboxed iframe on the web) next to pdf.js and jsQR, with
 * no network at all. It is handed a file's bytes, draws its pages and hands back every QR
 * text it reads off them. The app says whether each one is ours, so the reward-token rule
 * stays in one place (src/features/painter/reward-token.ts). The protocol is described in
 * src/features/painter/board-reader/protocol.ts. Ported from the painter website's
 * lib/board-file.ts and lib/qr-decode.ts, so pages are read in the same order and at the
 * same sizes as the website reads them.
 *
 * This file is not bundled as it is. scripts/build-board-reader.mjs puts it in one page
 * with pdf.js and jsQR. Run that after changing anything here.
 */
(function () {
  "use strict";

  const pdfjsLib = globalThis.pdfjsLib;
  const jsQR = globalThis.jsQR;

  /** Past about 16.7 million pixels, iOS gives a canvas no backing store at all. */
  const MAX_PIXELS = 16000000;
  /** Widths each page is drawn at: coarse first, which reads most boards, then finer. */
  const PDF_WIDTHS = [1400, 2200];
  const IMAGE_WIDTHS = [1400, 2400];
  /** The pages that are also cut into tiles, finest of all, before moving on. */
  const TILED_PAGES = 2;
  const TILE_WIDTH = 3200;

  let file = null;
  let reading = false;
  let answer = null;
  let offered = {};
  let detector;

  function send(message) {
    let text = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent && window.parent !== window) window.parent.postMessage(text, "*");
  }

  function fail(code, err) {
    let detail = err && err.message ? err.message : String(err || "");
    send({ type: "error", code: code, detail: detail.slice(0, 200) });
  }

  function ReaderError(code) {
    this.code = code;
    this.message = code;
  }

  // ── Getting the file ─────────────────────────────────────────────────────────────────

  function receive(event) {
    let message;
    try {
      message = typeof event.data === "string" ? JSON.parse(event.data) : null;
    } catch {
      return;
    }
    if (!message || typeof message.type !== "string") return;

    if (message.type === "begin") {
      if (reading || file) return;
      let size = message.size;
      if (typeof size !== "number" || size <= 0 || size !== Math.floor(size)) return fail("unreadable");
      try {
        file = { kind: message.kind === "image" ? "image" : "pdf", mime: String(message.mime || ""), bytes: new Uint8Array(size), at: 0, seq: 0 };
      } catch (e) {
        return fail("memory", e);
      }
    } else if (message.type === "chunk") {
      // In order, each once: a chunk delivered twice is not written twice.
      if (!file || reading || message.seq !== file.seq) return;
      let binary;
      try {
        binary = atob(String(message.data || ""));
      } catch (e) {
        file = null;
        return fail("unreadable", e);
      }
      if (file.at + binary.length > file.bytes.length) {
        file = null;
        return fail("unreadable");
      }
      for (let i = 0; i < binary.length; i++) file.bytes[file.at + i] = binary.charCodeAt(i);
      file.at += binary.length;
      file.seq += 1;
      send({ type: "ack", seq: message.seq });
    } else if (message.type === "end") {
      if (!file || reading) return;
      if (file.at !== file.bytes.length) {
        file = null;
        return fail("unreadable");
      }
      reading = true;
      read(file).then(
        function (found) {
          if (!found) send({ type: "none" });
        },
        function (err) {
          fail(err instanceof ReaderError ? err.code : err && err.name === "PasswordException" ? "locked" : "failed", err);
        },
      );
      file = null;
    } else if (message.type === "verdict") {
      let resolve = answer;
      answer = null;
      if (resolve) resolve(message.ours === true);
    }
  }

  // Android delivers the app's messages on document, iOS and the web on window.
  window.addEventListener("message", receive);
  document.addEventListener("message", receive);

  // ── Reading it ───────────────────────────────────────────────────────────────────────

  function read(job) {
    return job.kind === "image" ? readImage(job.bytes, job.mime) : readPdf(job.bytes);
  }

  /** Hands a text to the app and waits: true once it says the text is ours, which ends the reading. */
  function offer(text, page) {
    if (!text || offered[text]) return Promise.resolve(false);
    offered[text] = true;
    return new Promise(function (resolve) {
      answer = resolve;
      send({ type: "found", text: text, page: page });
    });
  }

  /** Last page first, then the first, then backwards through the rest, as the website does. */
  function pagesBackToFront(count) {
    let order = [count];
    if (count > 1) order.push(1);
    for (let page = count - 1; page > 1; page--) order.push(page);
    return order;
  }

  async function readPdf(bytes) {
    let doc;
    try {
      doc = await pdfjsLib.getDocument({
        data: bytes,
        isEvalSupported: false,
        disableFontFace: true,
        disableAutoFetch: true,
        disableStream: true,
        disableRange: true,
        enableXfa: false,
        verbosity: 0,
      }).promise;
    } catch (err) {
      throw new ReaderError(err && err.name === "PasswordException" ? "locked" : "unreadable");
    }

    try {
      let order = pagesBackToFront(doc.numPages);
      for (let index = 0; index < order.length; index++) {
        let pageNumber = order[index];
        send({ type: "progress", page: pageNumber, pages: doc.numPages });
        let page;
        try {
          page = await doc.getPage(pageNumber);
        } catch {
          // One broken page shouldn't stop the others being read.
          continue;
        }
        let widths = index < TILED_PAGES ? PDF_WIDTHS.concat([TILE_WIDTH]) : PDF_WIDTHS;
        for (let w = 0; w < widths.length; w++) {
          let canvas;
          try {
            canvas = await drawPage(page, widths[w]);
          } catch (err) {
            if (err instanceof ReaderError) throw err;
            break;
          }
          let found = false;
          try {
            found = await offerAll(canvas, pageNumber, widths[w] === TILE_WIDTH);
          } finally {
            release(canvas);
          }
          if (found) return true;
        }
        page.cleanup();
      }
      return false;
    } finally {
      doc.destroy();
    }
  }

  /** The scale for drawing something this wide, kept under the pixel cap. */
  function scaleFor(width, height, targetWidth) {
    let scale = targetWidth / width;
    if (width * scale * height * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (width * height));
    return scale;
  }

  function newCanvas(width, height) {
    let canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    let context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new ReaderError("canvas");
    // A white bed: a PDF page is see-through where nothing is drawn, and a QR on a
    // see-through canvas reads as light on light to every decoder.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function drawPage(page, targetWidth) {
    let base = page.getViewport({ scale: 1 });
    let viewport = page.getViewport({ scale: scaleFor(base.width, base.height, targetWidth) });
    let canvas = newCanvas(viewport.width, viewport.height);
    // The "print" intent draws in one go. The screen intent waits on animation frames between
    // steps, and a WebView that isn't on show may never give it one.
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport, intent: "print" }).promise;
    return canvas;
  }

  /** Lets go of a canvas's pixels now, not when the collector gets round to it. */
  function release(canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }

  async function readImage(bytes, mime) {
    let image;
    try {
      image = await loadImage(new Blob([bytes], { type: mime || "image/jpeg" }));
    } catch {
      throw new ReaderError("image");
    }
    let width = image.width;
    let height = image.height;
    if (!width || !height) throw new ReaderError("image");
    send({ type: "progress", page: 1, pages: 1 });
    try {
      for (let w = 0; w < IMAGE_WIDTHS.length; w++) {
        let scale = Math.min(1, scaleFor(width, height, IMAGE_WIDTHS[w]));
        let canvas = newCanvas(width * scale, height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        let found = false;
        try {
          found = await offerAll(canvas, 1, false);
        } finally {
          release(canvas);
        }
        if (found) return true;
        // Nothing gained by drawing it larger than it is.
        if (scale === 1) break;
      }
      return false;
    } finally {
      if (typeof image.close === "function") image.close();
    }
  }

  function loadImage(blob) {
    if (typeof createImageBitmap === "function") return createImageBitmap(blob);
    return new Promise(function (resolve, reject) {
      let url = URL.createObjectURL(blob);
      let image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      image.src = url;
    });
  }

  // ── Reading a QR off the pixels ──────────────────────────────────────────────────────

  /** The platform's own decoder where there is one; it reads creased, dim sheets better. */
  function platformDetector() {
    if (detector !== undefined) return detector;
    detector = null;
    try {
      if (typeof BarcodeDetector === "function") detector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      detector = null;
    }
    return detector;
  }

  function jsQrAt(context, x, y, width, height) {
    let image = context.getImageData(x, y, width, height);
    let result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
    return result && result.data ? result.data : null;
  }

  /**
   * Offers every QR on this canvas: the platform's reading, then jsQR's over the whole of
   * it, or (when `tiles`, on the largest drawing) over four overlapping parts of it, where
   * a small code on a busy page stands out. True once one of them is ours.
   */
  async function offerAll(canvas, page, tiles) {
    let context = canvas.getContext("2d", { willReadFrequently: true });
    let platform = platformDetector();
    if (platform) {
      try {
        let codes = await platform.detect(canvas);
        for (let i = 0; i < codes.length; i++) if (await offer(codes[i].rawValue, page)) return true;
      } catch {
        // A detector that fails on this canvas is treated as absent for it.
      }
    }
    if (!tiles) return offer(jsQrAt(context, 0, 0, canvas.width, canvas.height), page);
    let w = Math.round(canvas.width * 0.6);
    let h = Math.round(canvas.height * 0.6);
    let corners = [
      [canvas.width - w, canvas.height - h],
      [0, canvas.height - h],
      [canvas.width - w, 0],
      [0, 0],
    ];
    for (let c = 0; c < corners.length; c++) {
      if (await offer(jsQrAt(context, corners[c][0], corners[c][1], w, h), page)) return true;
    }
    return false;
  }

  if (!pdfjsLib || !jsQR) return fail("failed", new Error("reader incomplete"));
  send({ type: "ready" });
})();
