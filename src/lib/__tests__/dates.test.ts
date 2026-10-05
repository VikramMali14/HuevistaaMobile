import { formatDate, istHour, validitySpan } from "../dates";

describe("dates", () => {
  it("prints dates in India's time zone, whatever the phone's", () => {
    expect(formatDate("2026-10-05T20:00:00Z")).toBe("6 Oct 2026");
    expect(formatDate("2026-10-05T10:00:00Z")).toBe("5 Oct 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });

  it("reads the hour in India", () => {
    expect(istHour(Date.parse("2026-10-05T03:00:00Z"))).toBe(8);
  });

  it("says how long a room stays open", () => {
    expect(validitySpan(30)).toBe("30 days");
    expect(validitySpan(90)).toBe("3 months");
    expect(validitySpan(365)).toBe("a year");
    expect(validitySpan(730)).toBe("2 years");
  });
});
