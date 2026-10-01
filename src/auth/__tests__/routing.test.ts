import type { UserRole } from "@/api/types";

import { homeFor } from "../routing";

describe("homeFor", () => {
  it.each<[UserRole, string]>([
    ["CUSTOMER", "/home"],
    ["PAINTER", "/painter"],
    ["RETAILER", "/web-only"],
    ["DISTRIBUTOR", "/web-only"],
    ["ADMIN", "/web-only"],
  ])("sends a %s to %s", (role, route) => {
    expect(homeFor({ role })).toBe(route);
  });

  it("sends a new customer or painter to the first-run screen", () => {
    expect(homeFor({ role: "CUSTOMER", welcomePending: true })).toBe("/about-you");
    expect(homeFor({ role: "CUSTOMER", namePending: true })).toBe("/about-you");
    expect(homeFor({ role: "PAINTER", namePending: true })).toBe("/about-you");
  });

  it("never sends a shop to the first run — shops work on the website", () => {
    expect(homeFor({ role: "RETAILER", welcomePending: true })).toBe("/web-only");
  });
});
