/**
 * An AI image on the phone (C24): fetched once, only ever a whole JPEG, one fetch at a time
 * per image, nothing written for an account that has signed out, and saving to the photos
 * asks for nothing more than saving.
 */
import { clearRenderFiles, PictureNotFetched, renderFile, saveRenderToPhotos } from "../render-files";

// The phone's files, in memory.
const mockDisk = new Map<string, Uint8Array>();
const mockDirs = new Set<string>();
jest.mock("expo-file-system", () => {
  const join = (base: string | { uri: string }, name?: string) => (name === undefined ? String(base) : `${typeof base === "string" ? base : base.uri}/${name}`);
  class Directory {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = join(base, name);
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
    create() {
      mockDirs.add(this.uri);
    }
    delete() {
      mockDirs.delete(this.uri);
      for (const key of [...mockDisk.keys()]) if (key.startsWith(`${this.uri}/`)) mockDisk.delete(key);
    }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = join(base, name);
    }
    get exists() {
      return mockDisk.has(this.uri);
    }
    async bytes() {
      const bytes = mockDisk.get(this.uri);
      if (!bytes) throw new Error("No such file");
      return bytes;
    }
    create() {
      mockDisk.set(this.uri, new Uint8Array());
    }
    write(bytes: Uint8Array) {
      mockDisk.set(this.uri, bytes);
    }
    delete() {
      mockDisk.delete(this.uri);
    }
    move(to: { uri: string }) {
      mockDisk.set(to.uri, mockDisk.get(this.uri)!);
      mockDisk.delete(this.uri);
      this.uri = to.uri;
    }
  }
  return { Directory, File, Paths: { cache: "file://cache" } };
});
const mockLibrary = { requestPermissionsAsync: jest.fn(), saveToLibraryAsync: jest.fn() };
jest.mock("expo-media-library/legacy", () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockLibrary.requestPermissionsAsync(...args),
  saveToLibraryAsync: (...args: unknown[]) => mockLibrary.saveToLibraryAsync(...args),
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn() }));
const mockFetchMedia = jest.fn();
jest.mock("@/api/media", () => ({ fetchMedia: (...args: unknown[]) => mockFetchMedia(...args) }));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const answer = (bytes: Uint8Array) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const kept = "file://cache/ai-images/r1.jpg";

beforeEach(() => {
  clearRenderFiles();
  mockDisk.clear();
  mockDirs.clear();
  mockFetchMedia.mockReset();
  mockLibrary.requestPermissionsAsync.mockReset();
  mockLibrary.saveToLibraryAsync.mockReset();
});

describe("the picture on the phone", () => {
  it("is fetched once, kept whole, and used again from the phone", async () => {
    mockFetchMedia.mockResolvedValue(answer(JPEG));
    expect(await renderFile("https://bucket.s3/r1.jpg?sig=1", "r1")).toBe(kept);
    expect(mockDisk.get(kept)).toEqual(JPEG);
    // No half-written file is left beside it.
    expect([...mockDisk.keys()]).toEqual([kept]);
    expect(await renderFile("https://bucket.s3/r1.jpg?sig=2", "r1")).toBe(kept);
    expect(mockFetchMedia).toHaveBeenCalledTimes(1);
  });

  it("is fetched once when Send, Save and the PDF ask for it together", async () => {
    let arrive: (v: unknown) => void = () => {};
    mockFetchMedia.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
    const asks = [renderFile("https://x/r1.jpg", "r1"), renderFile("https://x/r1.jpg", "r1"), renderFile("https://x/r1.jpg", "r1")];
    arrive(answer(JPEG));
    expect(await Promise.all(asks)).toEqual([kept, kept, kept]);
    expect(mockFetchMedia).toHaveBeenCalledTimes(1);
  });

  it("a kept file that isn't a whole picture is fetched again", async () => {
    mockDirs.add("file://cache/ai-images");
    mockDisk.set(kept, new Uint8Array([0x3c, 0x3f, 0x78, 0x6d]));
    mockFetchMedia.mockResolvedValue(answer(JPEG));
    expect(await renderFile("https://x/r1.jpg", "r1")).toBe(kept);
    expect(mockDisk.get(kept)).toEqual(JPEG);
    expect(mockFetchMedia).toHaveBeenCalledTimes(1);
  });

  it("an answer that isn't a picture (an expired address's error page) is never kept", async () => {
    mockFetchMedia.mockResolvedValue(answer(new TextEncoder().encode("<?xml version='1.0'?><Error>AccessDenied</Error>")));
    await expect(renderFile("https://x/r1.jpg", "r1")).rejects.toBeInstanceOf(PictureNotFetched);
    expect(mockDisk.size).toBe(0);
  });

  it("a fetch that fails is said as a picture not fetched — and can be tried again", async () => {
    mockFetchMedia.mockRejectedValueOnce(new Error("Picture not available (403)")).mockResolvedValue(answer(JPEG));
    await expect(renderFile("https://x/r1.jpg?sig=1", "r1")).rejects.toBeInstanceOf(PictureNotFetched);
    expect(await renderFile("https://x/r1.jpg?sig=2", "r1")).toBe(kept);
  });

  it("a picture still arriving at sign-out is not written for the next account", async () => {
    let arrive: (v: unknown) => void = () => {};
    mockFetchMedia.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
    const ask = renderFile("https://x/r1.jpg", "r1");
    clearRenderFiles();
    arrive(answer(JPEG));
    await expect(ask).rejects.toBeInstanceOf(PictureNotFetched);
    expect(mockDisk.size).toBe(0);
  });

  it("an odd id is made a safe file name", async () => {
    mockFetchMedia.mockResolvedValue(answer(JPEG));
    expect(await renderFile("https://x/r.jpg", "../r1")).toBe("file://cache/ai-images/___r1.jpg");
  });
});

describe("saving to the photos", () => {
  it("asks only to add to the photos, and saves", async () => {
    mockLibrary.requestPermissionsAsync.mockResolvedValue({ granted: true });
    expect(await saveRenderToPhotos(kept)).toBe("saved");
    expect(mockLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(mockLibrary.saveToLibraryAsync).toHaveBeenCalledWith(kept);
  });

  it("says when it may not, and saves nothing", async () => {
    mockLibrary.requestPermissionsAsync.mockResolvedValue({ granted: false });
    expect(await saveRenderToPhotos(kept)).toBe("denied");
    expect(mockLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  });
});
