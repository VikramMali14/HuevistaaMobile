import { MAP_STYLE_URL, parsePageMessage, PinMapSession, PLACE_ZOOM, samePin, STREET_ZOOM, type MapState, type Pin } from "../pin-map/protocol";

/** One map's conversation, with what the app posted and what it heard, kept to look at. */
function conversation() {
  const posted: Record<string, unknown>[] = [];
  const moves: Pin[] = [];
  const states: MapState[] = [];
  const session = new PinMapSession((text) => posted.push(JSON.parse(text) as Record<string, unknown>), {
    onMove: (pin) => moves.push(pin),
    onState: (state) => states.push(state),
  });
  const say = (message: object) => session.receive(JSON.stringify(message));
  return { session, posted, moves, states, say };
}

const HOME = { latitude: 26.45123, longitude: 74.63987 };
const STREET = { latitude: 26.45312, longitude: 74.64123 };
const JAIPUR = { latitude: 26.9124, longitude: 75.7873 };

describe("pin map protocol (P5)", () => {
  it("reads only the page's own messages", () => {
    expect(parsePageMessage(JSON.stringify({ type: "loaded" }))).toEqual({ type: "loaded" });
    expect(parsePageMessage(JSON.stringify({ type: "moved", ...STREET }))).toEqual({ type: "moved", pin: STREET });
    expect(parsePageMessage(JSON.stringify({ type: "moved", latitude: 200, longitude: 74 }))).toBeNull();
    expect(parsePageMessage(JSON.stringify({ type: "moved", latitude: "26" }))).toBeNull();
    expect(parsePageMessage(JSON.stringify({ type: "navigate" }))).toBeNull();
    expect(parsePageMessage("not json")).toBeNull();
    expect(parsePageMessage({ type: "ready" })).toBeNull();
  });

  it("calls two pins a metre apart the same pin", () => {
    expect(samePin(HOME, { latitude: 26.451235, longitude: 74.639874 })).toBe(true);
    expect(samePin(HOME, STREET)).toBe(false);
    expect(samePin(HOME, null)).toBe(false);
  });

  it("starts the page where the pin is, once the page says it is there", () => {
    const { session, posted, states, say } = conversation();
    session.update({ pin: HOME, zoom: STREET_ZOOM, held: false });
    expect(posted).toEqual([]);

    say({ type: "loaded" });
    expect(posted).toEqual([
      {
        type: "start",
        pin: HOME,
        zoom: STREET_ZOOM,
        style: MAP_STYLE_URL,
        labels: expect.objectContaining({ "NavigationControl.ZoomIn": "Zoom in", "Map.Title": expect.stringMatching(/^Map of where you work from/) }),
        held: false,
      },
    ]);
    say({ type: "ready" });
    expect(states).toEqual(["loading", "ready"]);
  });

  it("tells the screen of the painter's moves, and not of the map's own", () => {
    const { session, posted, moves, say } = conversation();
    session.update({ pin: HOME, zoom: STREET_ZOOM, held: false });
    say({ type: "loaded" });
    posted.length = 0;

    say({ type: "moved", ...STREET });
    expect(moves).toEqual([STREET]);
    // The screen takes the move: the page is there already, so nothing goes back.
    session.update({ pin: STREET, zoom: STREET_ZOOM, held: false });
    expect(posted).toEqual([]);

    // A town typed: the map goes there, and that isn't a move of the painter's.
    session.update({ pin: JAIPUR, zoom: PLACE_ZOOM, held: false });
    expect(posted).toEqual([{ type: "show", pin: JAIPUR, zoom: PLACE_ZOOM }]);
    say({ type: "moved", ...JAIPUR });
    expect(moves).toEqual([STREET]);
  });

  it("holds the map still while the screen saves", () => {
    const { session, posted, say } = conversation();
    say({ type: "loaded" });
    posted.length = 0;
    session.update({ pin: null, zoom: STREET_ZOOM, held: true });
    session.update({ pin: null, zoom: STREET_ZOOM, held: true });
    session.update({ pin: null, zoom: STREET_ZOOM, held: false });
    expect(posted).toEqual([
      { type: "hold", held: true },
      { type: "hold", held: false },
    ]);
  });

  // Android brings a page back after its process went: it starts again where the pin is now.
  it("starts a page loaded again where the pin is now", () => {
    const { session, posted, say } = conversation();
    session.update({ pin: HOME, zoom: STREET_ZOOM, held: false });
    say({ type: "loaded" });
    say({ type: "moved", ...STREET });
    session.update({ pin: STREET, zoom: STREET_ZOOM, held: false });
    posted.length = 0;

    say({ type: "loaded" });
    expect(posted).toEqual([expect.objectContaining({ type: "start", pin: STREET })]);
  });

  it("says when the phone can't draw the map", () => {
    const { states, say } = conversation();
    say({ type: "loaded" });
    say({ type: "failed" });
    expect(states).toEqual(["loading", "failed"]);
  });
});
