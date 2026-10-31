import { t } from "@/i18n";

/**
 * The app's side of the pin map (P5): a WebView (an iframe on the web) runs MapLibre over
 * OpenFreeMap's free OpenStreetMap tiles, and this talks to it. The page is
 * scripts/pin-map/map.js, built into map-html.generated.ts.
 *
 * Page → app:  loaded · ready · moved {latitude, longitude} · failed
 * App → page:  start {pin, zoom, style, labels, held} · show {pin, zoom} · hold {held}
 *
 * The pin stays in the middle of the map and the map moves under it. The page tells the app
 * only of the painter's own moves; a pin the app shows it — the saved one, a town typed — is
 * flown to and not told back. A page loaded again (Android brings a WebView's page back after
 * its process went) says "loaded" again, and is started afresh where the pin is now.
 */

/** OpenFreeMap: free, no key and no account, and allowed in an app. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Where the style, tiles, fonts and icons all come from. Must agree with scripts/build-pin-map.mjs. */
export const MAP_ORIGIN = "https://tiles.openfreemap.org";

/** Close enough to tell one street from the next: where a saved pin is shown. */
export const STREET_ZOOM = 15.5;

/** A typed town or PIN code: its streets, for the pin to be moved onto the right one. */
export const PLACE_ZOOM = 13;

export interface Pin {
  latitude: number;
  longitude: number;
}

export interface PinMapProps {
  /** Where the pin stands: the one about to be saved, or the saved one; null when there is none. */
  pin: Pin | null;
  /** How close to show a `pin` that came from outside the map. */
  zoom: number;
  onMove: (pin: Pin) => void;
  disabled?: boolean;
}

export type MapState = "loading" | "ready" | "failed";

type PageMessage = { type: "loaded" } | { type: "ready" } | { type: "failed" } | { type: "moved"; pin: Pin };

/** A message from the page, or null for anything that isn't one. */
export function parsePageMessage(raw: unknown): PageMessage | null {
  if (typeof raw !== "string") return null;
  let m: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    m = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (m.type) {
    case "loaded":
    case "ready":
    case "failed":
      return { type: m.type };
    case "moved": {
      const pin = pinFrom(m);
      return pin ? { type: "moved", pin } : null;
    }
    default:
      return null;
  }
}

function pinFrom(value: Record<string, unknown>): Pin | null {
  const { latitude, longitude } = value;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** The same pin to within what the backend keeps (five decimal places, about a metre). */
export function samePin(a: Pin | null, b: Pin | null): boolean {
  return !!a && !!b && Math.abs(a.latitude - b.latitude) < 2e-5 && Math.abs(a.longitude - b.longitude) < 2e-5;
}

/** MapLibre's own words on the map, in the painter's language. */
function labels(): Record<string, string> {
  return {
    "Map.Title": t("painter.nearby.mapLabel"),
    "NavigationControl.ZoomIn": t("painter.nearby.mapZoomIn"),
    "NavigationControl.ZoomOut": t("painter.nearby.mapZoomOut"),
    "AttributionControl.ToggleAttribution": t("painter.nearby.mapCredits"),
  };
}

interface Want {
  pin: Pin | null;
  zoom: number;
  held: boolean;
}

/**
 * One map's conversation. `update` with what the screen wants shown, every render; `receive`
 * whatever the page says.
 */
export class PinMapSession {
  private want: Want = { pin: null, zoom: STREET_ZOOM, held: false };
  private started = false;
  /** Where the page's pin is, as far as the app knows. */
  private at: Pin | null = null;
  private held = false;

  constructor(
    private readonly post: (text: string) => void,
    private readonly events: { onMove: (pin: Pin) => void; onState: (state: MapState) => void },
  ) {}

  update(want: Want): void {
    this.want = want;
    if (!this.started) return;
    if (want.pin && !samePin(want.pin, this.at)) {
      this.at = want.pin;
      this.post(JSON.stringify({ type: "show", pin: want.pin, zoom: want.zoom }));
    }
    if (want.held !== this.held) {
      this.held = want.held;
      this.post(JSON.stringify({ type: "hold", held: want.held }));
    }
  }

  receive(raw: unknown): void {
    const m = parsePageMessage(raw);
    if (!m) return;
    switch (m.type) {
      case "loaded": {
        const { pin, zoom, held } = this.want;
        this.started = true;
        this.at = pin;
        this.held = held;
        this.post(JSON.stringify({ type: "start", pin, zoom, style: MAP_STYLE_URL, labels: labels(), held }));
        this.events.onState("loading");
        break;
      }
      case "ready":
        if (this.started) this.events.onState("ready");
        break;
      case "failed":
        this.events.onState("failed");
        break;
      case "moved":
        if (!this.started || samePin(m.pin, this.at)) return;
        this.at = m.pin;
        this.events.onMove(m.pin);
        break;
    }
  }
}
