import { barStyleOn } from "../status-bar";

describe("barStyleOn", () => {
  it("puts dark text on a pale colour and light text on a deep one", () => {
    expect(barStyleOn("#f6f1e4")).toBe("dark");
    expect(barStyleOn("#f5d33f")).toBe("dark");
    expect(barStyleOn("#3e4a52")).toBe("light");
    expect(barStyleOn("#1b2a4a")).toBe("light");
  });
});
