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

  it("fetches masks through the backend's own route", () => {
    expect(projectsApi.maskPath("p 1", 7)).toBe("/api/projects/p%201/regions/7/mask");
  });
});
