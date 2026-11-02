/**
 * A tap on the photo as shown lands on the same spot of the photo as read, and reads the
 * surface there — the website's reading — in the app's own words for how close a shade is.
 */
import { closenessWords, readAt, spotAt } from "../sampling";
import type { FinderPhoto } from "../photo-pixels";

function flat(width: number, height: number, rgb: [number, number, number]): FinderPhoto {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return { uri: "file:///photo.jpg", pixels: { width, height, data }, even: data };
}

describe("spotAt", () => {
  it("scales a tap on the photo as shown to the photo as read", () => {
    const shown = { width: 300, height: 200 };
    const read = { width: 480, height: 320 };
    expect(spotAt(0, 0, shown, read)).toEqual({ x: 0, y: 0 });
    expect(spotAt(150, 100, shown, read)).toEqual({ x: 240, y: 160 });
    expect(spotAt(299.9, 199.9, shown, read)).toEqual({ x: 479, y: 319 });
  });

  it("is nothing for a tap off the photo, or a photo with no size yet", () => {
    expect(spotAt(-1, 10, { width: 300, height: 200 }, { width: 480, height: 320 })).toBeNull();
    expect(spotAt(300, 10, { width: 300, height: 200 }, { width: 480, height: 320 })).toBeNull();
    expect(spotAt(10, 10, { width: 0, height: 0 }, { width: 480, height: 320 })).toBeNull();
  });
});

describe("readAt", () => {
  it("reads one wall as one colour, all of it agreeing", () => {
    const reading = readAt(flat(40, 30, [0x0b, 0x7a, 0x6e]), { x: 20, y: 15 }, true);
    expect(reading?.hex.toLowerCase()).toBe("#0b7a6e");
    expect(reading?.uniformity).toBeCloseTo(1, 5);
  });
});

describe("closenessWords", () => {
  it("says how close in the counter's three words", () => {
    expect(closenessWords(0)).toBe("Very close");
    expect(closenessWords(4.5)).toBe("Close");
    expect(closenessWords(12)).toBe("Not exact");
  });
});
