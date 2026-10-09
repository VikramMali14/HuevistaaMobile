import { calendarDaysUntil, daysUntil, formatDate, formatServerDate, formatServerDateTime, istHour, serverMoment, validitySpan } from "../dates";

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

  // The painter's server sends India's wall-clock time with no zone, sometimes to the microsecond.
  it("reads a zone-less server time as India's", () => {
    expect(serverMoment("2026-10-05T10:00:00")).toBe(Date.parse("2026-10-05T04:30:00Z"));
    expect(serverMoment("2026-10-05T10:00:00.123456")).toBe(Date.parse("2026-10-05T04:30:00.123Z"));
    expect(serverMoment("2026-10-05T10:00:00Z")).toBe(Date.parse("2026-10-05T10:00:00Z"));
    expect(serverMoment("2026-10-05T10:00:00+05:30")).toBe(Date.parse("2026-10-05T04:30:00Z"));
    expect(serverMoment(null)).toBeNaN();
  });

  it("prints a server time as India reads it", () => {
    expect(formatServerDate("2026-03-14T23:30:00")).toBe("14 Mar 2026");
    expect(formatServerDateTime("2026-03-14T16:20:00")).toBe("14 Mar, 4:20 pm");
    expect(formatServerDateTime("2026-03-14T00:05:00")).toBe("14 Mar, 12:05 am");
    expect(formatServerDate(undefined)).toBe("—");
  });

  it("counts days left rounded up, and never below none", () => {
    const now = Date.parse("2026-10-05T04:30:00Z"); // 10:00 in India
    expect(daysUntil("2026-10-08T10:00:00", now)).toBe(3);
    expect(daysUntil("2026-10-08T09:00:00", now)).toBe(3);
    expect(daysUntil("2026-10-05T11:00:00", now)).toBe(1);
    expect(daysUntil("2026-10-01T10:00:00", now)).toBe(0);
    expect(daysUntil("", now)).toBeNull();
  });

  // An hour left tonight is "today", not the "1 day" daysUntil rounds it up to.
  it("counts days by India's date for today and tomorrow", () => {
    const now = Date.parse("2026-10-05T15:30:00Z"); // 21:00 in India
    expect(calendarDaysUntil("2026-10-05T22:00:00", now)).toBe(0);
    expect(calendarDaysUntil("2026-10-06T00:30:00", now)).toBe(1);
    expect(calendarDaysUntil("2026-10-08T09:00:00", now)).toBe(3);
    expect(calendarDaysUntil("2026-10-04T09:00:00", now)).toBe(0);
    expect(calendarDaysUntil(null, now)).toBeNull();
  });
});
