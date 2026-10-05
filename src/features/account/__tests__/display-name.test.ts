import { givenName } from "../display-name";

describe("givenName", () => {
  it("is the name the person gave", () => {
    expect(givenName({ name: "  Priya Sharma " })).toBe("Priya Sharma");
  });

  it("is null for the stand-in an account wears until a name is typed", () => {
    expect(givenName({ name: "User", namePending: true })).toBeNull();
  });

  it("is null with no profile or an empty name", () => {
    expect(givenName(null)).toBeNull();
    expect(givenName({ name: "  " })).toBeNull();
  });
});
