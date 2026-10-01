import { formatPoints, formatRupees } from "../money";

describe("formatRupees", () => {
  it("shows whole rupees without decimals", () => {
    expect(formatRupees(9900)).toBe("₹99");
  });

  it("keeps paise when there are any", () => {
    expect(formatRupees(4950)).toBe("₹49.50");
  });

  it("groups thousands the Indian way", () => {
    expect(formatRupees(12_999_900)).toBe("₹1,29,999");
  });
});

describe("formatPoints", () => {
  it("is singular for one point", () => {
    expect(formatPoints(1)).toBe("1 point");
    expect(formatPoints(30)).toBe("30 points");
  });
});
