const mockRequest = jest.fn();
jest.mock("../instance", () => ({ api: { request: (...args: unknown[]) => mockRequest(...args) } }));

// eslint-disable-next-line import/first -- after the mock above
import { projectsApi } from "../endpoints/projects";

describe("projectsApi", () => {
  beforeEach(() => mockRequest.mockReset());

  it("reads a room that was never reported (204) as null — a query may not hold undefined", async () => {
    mockRequest.mockResolvedValue(undefined);
    await expect(projectsApi.latestReport("p1")).resolves.toBeNull();
    expect(mockRequest).toHaveBeenCalledWith("api/projects/p1/mask-reports/latest");
  });

  it("asks for a different set of suggestions each round", async () => {
    mockRequest.mockResolvedValue({ projectId: "p1", combinations: [] });
    await projectsApi.suggestions("p1", 2);
    expect(mockRequest).toHaveBeenCalledWith("api/projects/p1/recommendations", { method: "POST", query: { round: 2 } });
  });

  it("asks for an AI image with the time a full AI queue can take, and polls it by room and id", async () => {
    mockRequest.mockResolvedValue({});
    const body = {
      comboId: "c1",
      quality: "PREMIUM",
      sourceImage: "CLEANED",
      timeOfDay: "DAY",
      borderMode: "KEEP_ORIGINAL",
      lighting: "NATURAL",
      furnishing: "KEEP",
      style: "MODERN",
    } as const;
    await projectsApi.requestRender("p1", body);
    expect(mockRequest).toHaveBeenCalledWith("api/projects/p1/renders", { body, timeoutMs: 45_000 });
    await projectsApi.render("p1", "r 1");
    expect(mockRequest).toHaveBeenCalledWith("api/projects/p1/renders/r%201");
    await projectsApi.renders("p1");
    expect(mockRequest).toHaveBeenCalledWith("api/projects/p1/renders");
  });

  it("fetches masks through the backend's own route", () => {
    expect(projectsApi.maskPath("p 1", 7)).toBe("/api/projects/p%201/regions/7/mask");
  });
});
