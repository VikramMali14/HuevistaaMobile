/**
 * C7 · Create spends a room with no request key, so it is never sent again until the
 * rooms list has been read and shows nothing made from the photo.
 */
import { ApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import { keys } from "@/api/query-keys";
import type { ProjectSummary } from "@/api/types";

import { createRoom } from "../create-room";

const mockProjects = { create: jest.fn() };
jest.mock("@/api/endpoints/projects", () => ({
  get projectsApi() {
    return mockProjects;
  },
}));
const mockMe = { projects: jest.fn() };
jest.mock("@/api/endpoints/me", () => ({
  get meApi() {
    return mockMe;
  },
}));

const row = (id: string, imageId: string) => ({ id, imageId, name: "Room", status: "CREATED", imageUrl: "u", regionCount: 0 }) as ProjectSummary;
const room = { imageId: "img-1", name: "Bedroom" };
const timeout = new ApiError("timeout", 0, "Request timed out");

beforeEach(() => {
  mockProjects.create.mockReset();
  mockMe.projects.mockReset();
});
// The list it reads is kept in the cache, whose clean-up timer would hold Jest open.
afterEach(() => queryClient.clear());

describe("C7 · Create", () => {
  it("sends it once and says nothing more when it is answered", async () => {
    mockProjects.create.mockResolvedValue({ id: "p1" });
    expect(await createRoom(room, false)).toBe("p1");
    expect(mockMe.projects).not.toHaveBeenCalled();
  });

  it("obeys a refusal without looking for a room", async () => {
    const short = new ApiError("http", 402, "You have no rooms left.");
    mockProjects.create.mockRejectedValue(short);
    await expect(createRoom(room, false)).rejects.toBe(short);
    expect(mockMe.projects).not.toHaveBeenCalled();
  });

  it("takes the room an unanswered create made, and keeps the list it read", async () => {
    mockProjects.create.mockRejectedValue(new ApiError("http", 502, ""));
    mockMe.projects.mockResolvedValue([row("p0", "img-0"), row("p9", "img-1")]);
    expect(await createRoom(room, false)).toBe("p9");
    expect(queryClient.getQueryData(keys.projects)).toHaveLength(2);
  });

  it("says the create went unanswered when the list shows nothing, or can't be read", async () => {
    mockProjects.create.mockRejectedValue(timeout);
    mockMe.projects.mockResolvedValue([row("p0", "img-0")]);
    await expect(createRoom(room, false)).rejects.toBe(timeout);
    mockMe.projects.mockRejectedValue(new ApiError("network", 0, "Network request failed"));
    await expect(createRoom(room, false)).rejects.toBe(timeout);
  });

  it("looks first once it has been sent, and goes on into the room it made", async () => {
    mockMe.projects.mockResolvedValue([row("p9", "img-1")]);
    expect(await createRoom(room, true)).toBe("p9");
    expect(mockProjects.create).not.toHaveBeenCalled();
  });

  it("never sends it again while the list can't be read", async () => {
    const offline = new ApiError("network", 0, "Network request failed");
    mockMe.projects.mockRejectedValue(offline);
    await expect(createRoom(room, true)).rejects.toBe(offline);
    expect(mockProjects.create).not.toHaveBeenCalled();
  });

  it("sends it again only once the list shows it never landed", async () => {
    mockMe.projects.mockResolvedValue([]);
    mockProjects.create.mockResolvedValue({ id: "p2" });
    expect(await createRoom(room, true)).toBe("p2");
    expect(mockProjects.create).toHaveBeenCalledTimes(1);
  });
});
