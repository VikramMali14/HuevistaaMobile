/**
 * The REAL route tree (app/), rendered in Jest with expo-router's test renderer: where
 * each kind of person lands at start-up, what each role may open, and how deep links
 * behave. Only the native secure store and the network are faked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderRouter, screen, waitFor } from "expo-router/testing-library";

import type { UserProfile } from "@/api/types";
import { ApiError } from "@/api/errors";
import { forgetRememberedRoute } from "@/auth/pending-route";
import { screens } from "@/navigation/screens";
import { light } from "@/theme";
import { StyleSheet } from "react-native";

const mockSecure: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecure[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecure[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecure[key];
  }),
}));

const mockProfile = jest.fn<Promise<UserProfile>, []>();
jest.mock("@/api/endpoints/auth", () => ({
  authApi: {
    profile: () => mockProfile(),
    logout: jest.fn(async () => undefined),
  },
}));

function signedInAs(profile: Partial<UserProfile> & Pick<UserProfile, "role">) {
  mockSecure["hv.access"] = "access-token";
  mockSecure["hv.refresh"] = "refresh-token";
  mockProfile.mockResolvedValue({ id: "u1", name: "Priya", provider: "LOCAL", ...profile });
}

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  mockProfile.mockReset();
  forgetRememberedRoute();
  await AsyncStorage.clear();
});

describe("start-up (A1)", () => {
  it("sends a signed-out person to Welcome", async () => {
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(screen.getByText("Continue with mobile number")).toBeTruthy();
  });

  it("sends a customer to Home, with the five customer tabs", async () => {
    signedInAs({ role: "CUSTOMER" });
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/home"));
    for (const tab of ["Home", "Studio", "Catalogue", "Boards", "Account"]) {
      expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
    }
  });

  it("sends a painter to the painter's Home, with Scan in the tabs", async () => {
    signedInAs({ role: "PAINTER" });
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/painter"));
    expect(screen.getAllByText("Scan").length).toBeGreaterThan(0);
  });

  it.each(["RETAILER", "DISTRIBUTOR", "ADMIN"] as const)("sends a %s to the web-only screen", async (role) => {
    signedInAs({ role });
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/web-only"));
  });

  it("sends a brand-new account to About you first", async () => {
    signedInAs({ role: "CUSTOMER", welcomePending: true });
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/about-you"));
  });

  it("says it can't reach the server — and does not sign out — when offline with nothing cached", async () => {
    mockSecure["hv.access"] = "access-token";
    mockSecure["hv.refresh"] = "refresh-token";
    mockProfile.mockRejectedValue(new ApiError("network", 0, "offline"));
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    expect(screen).toHavePathname("/");
    expect(mockSecure["hv.refresh"]).toBe("refresh-token");
  });

  it("opens from the cached profile when offline", async () => {
    await AsyncStorage.setItem(
      "hv.profile",
      JSON.stringify({ id: "u1", name: "Priya", provider: "LOCAL", role: "CUSTOMER" }),
    );
    mockSecure["hv.access"] = "access-token";
    mockSecure["hv.refresh"] = "refresh-token";
    mockProfile.mockRejectedValue(new ApiError("network", 0, "offline"));
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/home"));
  });

  it("signs out when the server refuses the session", async () => {
    mockSecure["hv.access"] = "access-token";
    mockSecure["hv.refresh"] = "refresh-token";
    mockProfile.mockRejectedValue(new ApiError("http", 401, "expired"));
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(mockSecure["hv.refresh"]).toBeUndefined();
  });
});

describe("guards", () => {
  it("keeps a painter out of the customer's screens", async () => {
    signedInAs({ role: "PAINTER" });
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen).toHavePathname("/painter"));
  });

  it("keeps a customer out of the painter's screens", async () => {
    signedInAs({ role: "CUSTOMER" });
    renderRouter("./app", { initialUrl: "/painter/scan" });
    await waitFor(() => expect(screen).toHavePathname("/home"));
  });

  it("sends a signed-out deep link into the studio to Welcome", async () => {
    renderRouter("./app", { initialUrl: "/room/demo/paint" });
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
  });

  it("sends a signed-in person away from the sign-in screens", async () => {
    signedInAs({ role: "CUSTOMER" });
    renderRouter("./app", { initialUrl: "/phone" });
    await waitFor(() => expect(screen).toHavePathname("/home"));
  });

  it("lets any signed-in role open the shared account screens", async () => {
    signedInAs({ role: "PAINTER" });
    renderRouter("./app", { initialUrl: "/settings" });
    await waitFor(() => expect(screen.getByText("Settings")).toBeTruthy());
    expect(screen).toHavePathname("/settings");
  });
});

describe("painter tab bar", () => {
  // Jest's React Native reports a light phone theme, so the light palette applies.
  const scanColours = () =>
    screen.getAllByText("Scan").map((node) => StyleSheet.flatten(node.props.style)?.color);

  it("turns the Scan label brass while Scan is open", async () => {
    signedInAs({ role: "PAINTER" });
    renderRouter("./app", { initialUrl: "/painter/scan" });
    await waitFor(() => expect(screen).toHavePathname("/painter/scan"));
    expect(scanColours()).toContain(light.accentText);
  });

  it("leaves the Scan label muted on another tab", async () => {
    signedInAs({ role: "PAINTER" });
    renderRouter("./app", { initialUrl: "/painter" });
    await waitFor(() => expect(screen).toHavePathname("/painter"));
    expect(scanColours()).toEqual([light.fgMute]);
  });
});

describe("deep links", () => {
  it("opens a studio step for a customer, with its params", async () => {
    signedInAs({ role: "CUSTOMER" });
    renderRouter("./app", { initialUrl: "/room/abc123/board" });
    await waitFor(() => expect(screen.getByText("Colour board — choose and confirm")).toBeTruthy());
    expect(screen).toHavePathname("/room/abc123/board");
    expect(screen.getByText(/projectId=abc123/)).toBeTruthy();
  });

  it("opens a board's QR link without signing in", async () => {
    renderRouter("./app", { initialUrl: "/r/some-token" });
    await waitFor(() => expect(screen.getByText("A board's QR")).toBeTruthy());
    expect(screen).toHavePathname("/r/some-token");
  });

  it("shows Not found for a link that opens nothing", async () => {
    renderRouter("./app", { initialUrl: "/no-such-page" });
    await waitFor(() => expect(screen.getByText("Nothing here")).toBeTruthy());
  });
});

describe("every planned screen", () => {
  // Who may open each area — the same rule the route guards enforce.
  const roleFor = { auth: null, links: null, onboarding: "CUSTOMER", customer: "CUSTOMER", account: "CUSTOMER", painter: "PAINTER" } as const;
  const planned = Object.entries(screens).filter(([id, s]) => id !== "A1" && s.status === "planned");

  it.each(planned)("%s opens without breaking", async (id, info) => {
    const role = roleFor[info.area];
    if (role) signedInAs({ role });
    renderRouter("./app", { initialUrl: info.href });
    await waitFor(() => expect(screen.getByText(`${id} · Phase ${info.phase}`)).toBeTruthy());
    expect(screen.getAllByText(info.title).length).toBeGreaterThan(0);
  });
});
