import { Image } from "react-native";

// An in-memory file system with expo-file-system's File and Directory shapes.
jest.mock("expo-file-system", () => {
  const disk = new Map<string, Uint8Array>();
  const join = (parent: { uri: string }, name: string) => `${parent.uri.replace(/\/$/, "")}/${name}`;
  class Directory {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = join(parent, name);
    }
    get exists() {
      return [...disk.keys()].some((k) => k.startsWith(`${this.uri}/`));
    }
    create() {}
    delete() {
      for (const k of [...disk.keys()]) if (k.startsWith(`${this.uri}/`)) disk.delete(k);
    }
  }
  class File {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = join(parent, name);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf("/") + 1);
    }
    get exists() {
      return disk.has(this.uri);
    }
    create() {
      disk.set(this.uri, new Uint8Array());
    }
    write(bytes: Uint8Array) {
      if ((globalThis as { failWrite?: boolean }).failWrite) throw new Error("disk full");
      disk.set(this.uri, bytes);
    }
    async move(to: { uri: string }) {
      disk.set(to.uri, disk.get(this.uri)!);
      disk.delete(this.uri);
    }
    delete() {
      disk.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: { uri: "file:///cache" } }, __disk: disk };
});

const mockFetch = jest.fn();
jest.mock("@/api/media", () => ({ fetchMedia: (...a: unknown[]) => mockFetch(...a) }));

// eslint-disable-next-line import/first -- after the mocks above
import { clearStudioCache, loadTexture } from "../texture-loader";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const disk: Map<string, Uint8Array> = require("expo-file-system").__disk;
const getSize = jest.spyOn(Image, "getSize");

beforeEach(() => {
  disk.clear();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  getSize.mockReset();
  getSize.mockImplementation((_uri, ok) => ok(800, 600));
  (globalThis as { failWrite?: boolean }).failWrite = false;
});

describe("the studio's picture cache", () => {
  it("fetches a picture once and reads it from the phone after that", async () => {
    const first = await loadTexture("https://bucket/room.jpg?sig=1", "https://bucket/room.jpg");
    const again = await loadTexture("https://bucket/room.jpg?sig=2", "https://bucket/room.jpg");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ pixels: { localUri: expect.stringMatching(/^file:\/\/\/cache\/studio\/studio-/) }, width: 800, height: 600 });
    expect(again.pixels).toEqual(first.pixels);
  });

  it("never leaves a half-written picture that looks cached", async () => {
    (globalThis as { failWrite?: boolean }).failWrite = true;
    await expect(loadTexture("https://bucket/room.jpg")).rejects.toThrow("disk full");
    (globalThis as { failWrite?: boolean }).failWrite = false;
    await loadTexture("https://bucket/room.jpg");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fetches a cached picture again, once, when it can't be read", async () => {
    await loadTexture("https://bucket/room.jpg");
    getSize.mockImplementationOnce((_uri, _ok, fail) => fail?.(new Error("bad file")));
    const texture = await loadTexture("https://bucket/room.jpg");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(texture.width).toBe(800);
  });

  it("forgets every studio picture (sign-out)", async () => {
    await loadTexture("https://bucket/room.jpg");
    expect(disk.size).toBe(1);
    clearStudioCache();
    expect(disk.size).toBe(0);
    await loadTexture("https://bucket/room.jpg");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
