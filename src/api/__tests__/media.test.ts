import { mediaSource } from "../media";

// jest.mock calls are hoisted above the import.
jest.mock("@/config/env", () => ({ env: { apiOrigin: "https://api.test" } }));
jest.mock("../instance", () => ({ tokens: { accessToken: "token-abcdefghijklmnop" } }));

describe("mediaSource", () => {
  it("uses an outside link as it is", () => {
    expect(mediaSource("https://bucket.s3.amazonaws.com/a.jpg?sig=1")).toEqual({ uri: "https://bucket.s3.amazonaws.com/a.jpg?sig=1" });
  });

  it("gives the backend's own file route the API origin and the token", () => {
    const src = mediaSource("/api/images/files/a.jpg");
    expect(src).toMatchObject({
      uri: "https://api.test/api/images/files/a.jpg",
      headers: { Authorization: "Bearer token-abcdefghijklmnop" },
    });
  });

  it("adds the token to an absolute link on the API too", () => {
    expect(mediaSource("https://api.test/api/images/files/b.jpg")).toMatchObject({ headers: { Authorization: expect.any(String) } });
  });

  it("is null with no link", () => {
    expect(mediaSource(null)).toBeNull();
    expect(mediaSource("")).toBeNull();
  });
});
