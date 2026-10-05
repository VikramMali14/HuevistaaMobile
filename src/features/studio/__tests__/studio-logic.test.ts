import type { RoomDetail, RoomRegion } from "@/api/types";

import { summarise } from "../engine/check";
import { meanLumaInMask, paintTarget, regionPaints, wallAt, coverage } from "../engine/paint-model";
import type { Readback } from "../engine/recolor-gl";
import { shrunkSize } from "../photo-upload";
import { defaultRoomName } from "../room-names";
import { pollDelay } from "../use-segmentation-poll";
import { stepFor } from "../use-room";
import { planWalls, reportLine, wallLabel, wallsForTrio } from "../wall-plan";

const region = (id: number, category: RoomRegion["category"], extra: Partial<RoomRegion> = {}): RoomRegion => ({
  id,
  label: "",
  category,
  maskUrl: `m${id}.png`,
  manual: false,
  ...extra,
});
const room = (extra: Partial<RoomDetail> = {}): RoomDetail => ({
  id: "p1",
  name: "Room",
  status: "SEGMENTED",
  imageId: "i",
  imageUrl: "u",
  regions: [region(1, "MAIN_WALL")],
  ...extra,
});

/** A w×h read-back, white where `on(x, y)`. */
function sample(w: number, h: number, on: (x: number, y: number) => boolean, rgb: [number, number, number] = [255, 255, 255]): Readback {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (on(x, y)) data.set([...rgb, 255], i);
      else data.set([0, 0, 0, 255], i);
    }
  }
  return { width: w, height: h, data };
}

describe("where a room opens", () => {
  it("follows the room's state", () => {
    expect(stepFor(room({ status: "CREATED", regions: [] }), false)).toBe("tidy");
    expect(stepFor(room({ status: "SEGMENTING" }), false)).toBe("tidy");
    expect(stepFor(room({ status: "FAILED" }), false)).toBe("tidy");
    expect(stepFor(room({ regions: [] }), false)).toBe("adjust");
    expect(stepFor(room({ regions: [region(1, "MAIN_WALL", { maskUrl: null })] }), false)).toBe("adjust");
    expect(stepFor(room(), false)).toBe("walls");
    expect(stepFor(room(), true)).toBe("paint");
    expect(stepFor(room({ closedAt: "2026-09-01T10:00:00" }), false)).toBe("paint");
    expect(stepFor(room({ readOnly: true, status: "CREATED" }), false)).toBe("paint");
  });
});

describe("polling", () => {
  it("asks every 2 seconds, then every 5 after a minute", () => {
    expect(pollDelay(0)).toBe(2000);
    expect(pollDelay(59_999)).toBe(2000);
    expect(pollDelay(60_000)).toBe(5000);
  });
});

describe("the paint plan", () => {
  it("orders walls base first, trim last, and leaves out walls taken out of the plan", () => {
    const walls = [region(1, "TRIM"), region(2, "OTHER_WALL"), region(3, "MAIN_WALL"), region(4, "ACCENT_WALL", { inPlan: false }), region(5, "CEILING")];
    expect(planWalls(walls).map((w) => w.id)).toEqual([3, 2, 5, 1]);
  });

  it("puts a palette's main, accent and trim on the walls they are for", () => {
    const walls = [region(1, "TRIM"), region(2, "ACCENT_WALL"), region(3, "MAIN_WALL")];
    expect(wallsForTrio(walls, null).map((w) => w?.id)).toEqual([3, 2, 1]);
  });

  it("with no main wall named, puts the main colour on the wall being looked at", () => {
    const walls = [region(7, "OTHER_WALL"), region(8, "MANUAL")];
    expect(wallsForTrio(walls, 8).map((w) => w?.id)).toEqual([8, 7, undefined]);
  });

  it("names a wall by its label, or by what it is", () => {
    expect(wallLabel(region(1, "ACCENT_WALL"))).toBe("Accent wall");
    expect(wallLabel(region(1, "MANUAL", { label: "Chimney breast" }))).toBe("Chimney breast");
  });

  it("says what a report's state means", () => {
    expect(reportLine(undefined)).toBeNull();
    expect(reportLine({ id: "r", issues: [], status: "IN_REVIEW" })).toMatch(/redrawing/);
    expect(reportLine({ id: "r", issues: [], status: "FIXED", fixNote: "Moved the left edge" })).toBe("Fixed: Moved the left edge");
    expect(reportLine({ id: "r", issues: [], status: "RESOLVED" })).toMatch(/closed it/);
  });
});

describe("the photo", () => {
  it("shrinks the long edge to 2048 and never grows a small photo", () => {
    expect(shrunkSize(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(shrunkSize(3000, 4000)).toEqual({ width: 1536, height: 2048 });
    expect(shrunkSize(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it("names a room by what it is, or by the day", () => {
    expect(defaultRoomName("Kitchen")).toBe("Kitchen");
    expect(defaultRoomName(null, new Date(2026, 9, 5))).toBe("Photo · 5 Oct");
  });
});

describe("the engine's arithmetic", () => {
  it("paints a catalogue shade at its measured lightness, a mixed colour as it is", () => {
    expect(paintTarget("#808080")).toEqual([128 / 255, 128 / 255, 128 / 255]);
    const dark = paintTarget("#808080", 5);
    expect(dark[0]).toBeLessThan(128 / 255);
  });

  it("gives every painted wall the studio's fixed settings", () => {
    const [paint] = regionPaints([{ id: "1", hex: "#ffffff" }], { baseL: new Map([["1", 0.6]]), cleaned: true });
    expect(paint).toMatchObject({ maskId: "1", preserve: 0.85, baseL: 0.6, anchor: true });
  });

  it("measures a wall's light from the photo inside its mask only", () => {
    const image = sample(4, 2, (x) => x < 2, [200, 200, 200]);
    const mask = sample(4, 2, (x) => x < 2);
    expect(meanLumaInMask(image, mask)).toBeCloseTo(200 / 255);
    expect(meanLumaInMask(image, sample(4, 2, () => false))).toBe(0);
    expect(meanLumaInMask(image, sample(2, 2, () => true))).toBe(0);
  });

  it("finds the wall under a finger: the top one, or the nearest within a finger's width", () => {
    const left = sample(10, 10, (x) => x < 5);
    const all = sample(10, 10, () => true);
    expect(wallAt(0.2, 0.5, [{ id: "a", sample: left }])).toBe("a");
    expect(wallAt(0.2, 0.5, [{ id: "a", sample: left }, { id: "b", sample: all }])).toBe("b");
    expect(wallAt(0.62, 0.5, [{ id: "a", sample: left }])).toBe("a");
    expect(wallAt(0.95, 0.5, [{ id: "a", sample: left }])).toBeNull();
    expect(wallAt(1.2, 0.5, [{ id: "a", sample: all }])).toBeNull();
  });

  it("knows how much of the photo a wall covers", () => {
    expect(coverage(sample(10, 10, (x) => x < 5))).toBe(0.5);
  });

  it("reads out the live-colour check", () => {
    const times = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(summarise(times, 300)).toEqual({ firstFrameMs: 300, medianMs: 11, p95Ms: 20, maxMs: 20 });
  });
});
