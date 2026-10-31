/**
 * The map a painter puts their pin on (P5), the part that runs in the page.
 *
 * It runs in a WebView (an iframe on the web) next to MapLibre GL JS, drawing OpenFreeMap's
 * free OpenStreetMap tiles — the one place the page's policy lets it reach. The pin stays in
 * the middle and the map moves under it: dragged, zoomed, or tapped where the pin should go.
 * Only the painter's own moves are told to the app; the app's "show" — the saved pin, a town
 * typed — moves the map without being told back. The protocol is described in
 * src/features/painter/pin-map/protocol.ts. As the painter website's listing/pin-map.tsx.
 *
 * This file is not bundled as it is. scripts/build-pin-map.mjs puts it in one page with
 * MapLibre. Run that after changing anything here.
 */
(function () {
  "use strict";

  const gl = globalThis.maplibregl;

  /** All of India, for a painter with no pin yet: they type their town, or zoom in to it. */
  const INDIA = { latitude: 22.6, longitude: 79.0, zoom: 3.6 };
  /** No closer than this — the pin is a base, not a front door — and no further than India. */
  const MIN_ZOOM = 3;
  const MAX_ZOOM = 18;
  /** Give up on a map that hasn't drawn in this long, rather than show a grey box. */
  const LOAD_MS = 20000;

  let map = null;
  /** Where the map's middle is, as far as this page knows. */
  let at = null;
  let held = false;
  let drawn = false;
  let failed = false;

  function send(message) {
    const text = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent && window.parent !== window) window.parent.postMessage(text, "*");
  }

  function fail() {
    if (failed || drawn) return;
    failed = true;
    send({ type: "failed" });
  }

  /** The backend keeps a pin to five decimal places, about a metre. */
  function round(degrees) {
    return Math.round(degrees * 100000) / 100000;
  }

  function same(a, b) {
    return !!a && !!b && Math.abs(a.latitude - b.latitude) < 2e-5 && Math.abs(a.longitude - b.longitude) < 2e-5;
  }

  /**
   * The style without its border lines. OpenStreetMap draws borders as they stand on the ground,
   * which in Kashmir is not India's official map — and a pin on a street needs no borders at all.
   * Place names stay.
   */
  function withoutBorders(_previous, next) {
    return Object.assign({}, next, {
      layers: next.layers.filter(function (layer) {
        return layer["source-layer"] !== "boundary";
      }),
    });
  }

  function pinFrom(value) {
    if (!value || typeof value.latitude !== "number" || typeof value.longitude !== "number") return null;
    if (!isFinite(value.latitude) || !isFinite(value.longitude)) return null;
    return { latitude: value.latitude, longitude: value.longitude };
  }

  function start(options) {
    const first = pinFrom(options.pin);
    try {
      map = new gl.Map({
        container: "map",
        center: first ? [first.longitude, first.latitude] : [INDIA.longitude, INDIA.latitude],
        zoom: first && typeof options.zoom === "number" ? options.zoom : INDIA.zoom,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // A flat map that only pans and zooms: turned or tilted, it stops looking like the street.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        renderWorldCopies: false,
        locale: options.labels || {},
      });
    } catch (_e) {
      // No WebGL: this phone can't draw the map at all.
      map = null;
      fail();
      return;
    }
    map.setStyle(options.style, { transformStyle: withoutBorders });
    at = first;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");
    const timer = setTimeout(fail, LOAD_MS);
    map.once("load", function () {
      clearTimeout(timer);
      if (failed) return;
      drawn = true;
      send({ type: "ready" });
    });
    map.on("error", function (e) {
      // A tile that failed is one grey square; a style that failed is no map.
      if (!drawn && !e.sourceId && !e.tile) {
        clearTimeout(timer);
        fail();
      }
    });
    // A tap puts the pin there.
    map.on("click", function (e) {
      if (!held) map.easeTo({ center: e.lngLat }, { originalEvent: e.originalEvent });
    });
    map.on("movestart", function (e) {
      if (e.originalEvent) document.body.className = "moving";
    });
    // Every move the painter makes carries the event that made it; the map's own flights don't.
    map.on("moveend", function (e) {
      document.body.className = "";
      if (!e.originalEvent) return;
      const middle = map.getCenter().wrap();
      const moved = { latitude: round(middle.lat), longitude: round(middle.lng) };
      // A zoom about the middle leaves the pin where it was: not a move.
      if (same(moved, at)) return;
      at = moved;
      send({ type: "moved", latitude: moved.latitude, longitude: moved.longitude });
    });
  }

  /** A pin from the app — the saved one, a town typed: go to it, unless the map is there already. */
  function show(options) {
    const next = pinFrom(options.pin);
    if (!map || !next || same(next, at)) return;
    at = next;
    map.flyTo({ center: [next.longitude, next.latitude], zoom: options.zoom });
  }

  /** Still while the screen saves. */
  function hold(on) {
    held = !!on;
    if (!map) return;
    [map.dragPan, map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard].forEach(function (handler) {
      if (held) handler.disable();
      else handler.enable();
    });
    if (!held) {
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    }
  }

  function receive(event) {
    let m;
    try {
      m = typeof event.data === "string" ? JSON.parse(event.data) : null;
    } catch (_e) {
      return;
    }
    if (!m || typeof m.type !== "string") return;
    if (m.type === "start") {
      if (map || failed) return;
      if (!gl) {
        fail();
        return;
      }
      start(m);
      hold(m.held);
    } else if (m.type === "show") show(m);
    else if (m.type === "hold") hold(m.held);
  }

  window.addEventListener("message", receive);
  // React Native's WebView on Android delivers to the document.
  document.addEventListener("message", receive);
  send({ type: "loaded" });
})();
