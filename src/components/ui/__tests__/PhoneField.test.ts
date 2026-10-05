import { nextDigits } from "../PhoneField";

describe("PhoneField nextDigits", () => {
  it("keeps typed and pasted digits, up to ten", () => {
    expect(nextDigits("98765 4", "98765")).toBe("987654");
    expect(nextDigits("+91 98765 43210", "")).toBe("9876543210");
    expect(nextDigits("98765 432101", "9876543210")).toBe("9876543210");
  });

  it("deleting the space between the groups deletes the digit before it", () => {
    // "98765 43210" with the space removed by backspace.
    expect(nextDigits("9876543210", "9876543210")).toBe("987643210");
  });

  it("an ordinary backspace at the end removes the last digit", () => {
    expect(nextDigits("98765 4321", "9876543210")).toBe("987654321");
    expect(nextDigits("98765 ", "987654")).toBe("98765");
  });
});
