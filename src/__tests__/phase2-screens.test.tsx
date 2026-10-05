/**
 * Phase 2 through the REAL route tree: Home, the catalogue, a shade, ready-made rooms,
 * a shop code, products, Account and the account screens. Only the network, the secure
 * store, the clipboard and the system browser are faked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { ApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import type { CustomerEntitlement, FreeProject, ProjectSummary, UserProfile } from "@/api/types";
import { forgetRememberedRoute } from "@/auth/pending-route";
import { encodeShades } from "@/lib/shade-codec";
import type { BackendShade } from "@/lib/shade-mapping";

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
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn(), openBrowserAsync: jest.fn(async () => ({})) }));
const mockCopy = jest.fn<Promise<boolean>, [string]>(async () => true);
jest.mock("expo-clipboard", () => ({ setStringAsync: (text: string) => mockCopy(text) }));

const mockAuth = {
  profile: jest.fn<Promise<UserProfile>, []>(),
  logout: jest.fn(async () => undefined),
  updateProfile: jest.fn(),
  welcomeSeen: jest.fn(),
  sendEmailCode: jest.fn(),
  confirmEmailCode: jest.fn(),
  sendPhoneCode: jest.fn(),
  confirmPhoneCode: jest.fn(),
  changePassword: jest.fn(async () => ({})),
  setPassword: jest.fn(async () => ({})),
  deleteAccount: jest.fn(async () => undefined),
  switchProfile: jest.fn(),
  shopEmailCode: jest.fn(),
};
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));

const mockMe = {
  entitlement: jest.fn<Promise<CustomerEntitlement | null>, []>(),
  projectOptions: jest.fn(),
  aiCredits: jest.fn(),
  projects: jest.fn<Promise<ProjectSummary[]>, []>(),
  renders: jest.fn(),
  redeemCode: jest.fn(),
  assignedProducts: jest.fn(),
};
jest.mock("@/api/endpoints/me", () => ({ meApi: mockMe }));

const mockShades = { mine: jest.fn(), myBrands: jest.fn(), detail: jest.fn(), scheme: jest.fn() };
jest.mock("@/api/endpoints/shades", () => ({ shadesApi: mockShades }));

const mockLibrary = { list: jest.fn<Promise<FreeProject[]>, []>(), get: jest.fn(), start: jest.fn() };
jest.mock("@/api/endpoints/library", () => ({ libraryApi: mockLibrary }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function person(extra: Partial<UserProfile> = {}): UserProfile {
  return { id: "u1", name: "Priya Sharma", provider: "LOCAL", role: "CUSTOMER", ...extra };
}
function signedInAs(profile: UserProfile) {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue(profile);
}
const entitlement = (remaining: number, allowance = 3): CustomerEntitlement => ({
  customerId: "u1",
  customerName: "Priya",
  projectAllowance: allowance,
  projectsCreated: allowance - remaining,
  projectsRemaining: remaining,
});
const options = (available: number) => ({
  subscribed: false,
  projectPricePoints: 0,
  projectPricePaise: 19900,
  pointsBalance: 0,
  validDays: 30,
  availableCredits: available,
});
const room = (extra: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "p1",
  name: "Living room",
  status: "SEGMENTED",
  imageId: "i1",
  imageUrl: "/api/images/files/p1.jpg",
  regionCount: 3,
  updatedAt: "2026-10-04T10:00:00",
  ...extra,
});
const libraryRoom: FreeProject = {
  slug: "sunlit-lounge",
  title: "Sunlit lounge",
  description: "A west-facing living room.",
  space: "INTERIOR",
  roomLabel: "Living room",
  imageUrl: "/api/free-projects/files/sunlit.jpg",
  wallCount: 3,
  colours: [{ label: "Feature wall", hex: "#b96b48", shadeCode: "HV0101" }],
};
const backendShade = (code: string, hex: string, family: string, lrv: number, brand = "Asian Paints"): BackendShade => ({
  shadeCode: code,
  hvCode: code,
  hexCode: hex,
  shadeFamily: family,
  lrv,
  brandName: brand,
  brandSlug: brand.toLowerCase().replace(/ /g, "-"),
});
const SHADES = [
  backendShade("HV0001", "#f6f1e4", "Off Whites", 85),
  backendShade("HV0002", "#f5d33f", "Yellows", 62),
  backendShade("HV0003", "#3e4a52", "Greys", 12),
  backendShade("HV0004", "#7b8a72", "Greens", 30, "Berger"),
];
const BRANDS = [
  { name: "Asian Paints", slug: "asian-paints", shadeCount: 3 },
  { name: "Berger", slug: "berger", shadeCount: 1 },
];

const press = (text: string | RegExp) => fireEvent.press(screen.getByText(text));
const pressLast = (text: string | RegExp) => {
  const all = screen.getAllByText(text);
  fireEvent.press(all[all.length - 1]!);
};
const type = (label: string | RegExp, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  for (const group of [mockAuth, mockMe, mockShades, mockLibrary]) {
    for (const fn of Object.values(group)) (fn as jest.Mock).mockReset();
  }
  mockAuth.logout.mockResolvedValue(undefined);
  mockMe.entitlement.mockResolvedValue(null);
  mockMe.projectOptions.mockResolvedValue(options(0));
  mockMe.aiCredits.mockResolvedValue({ balance: 12, eligible: true });
  mockMe.projects.mockResolvedValue([]);
  mockMe.renders.mockResolvedValue([]);
  mockLibrary.list.mockResolvedValue([]);
  mockShades.mine.mockResolvedValue(SHADES);
  mockShades.myBrands.mockResolvedValue(BRANDS);
  mockShades.scheme.mockResolvedValue({ showBrands: false, showRealCodes: false });
  mockShades.detail.mockRejectedValue(new ApiError("http", 404, "Shade not found"));
  mockCopy.mockClear();
  queryClient.clear();
  // A failed read is retried twice in the app (patchy 4G); tests see the failure at once.
  queryClient.setDefaultOptions({ queries: { retry: false } });
  forgetRememberedRoute();
  await AsyncStorage.clear();
});

// ── C1 Home ───────────────────────────────────────────────────────────────────

describe("C1 · Home", () => {
  it("ready: says how many rooms, where they came from, and starts one", async () => {
    signedInAs(person());
    mockMe.entitlement.mockResolvedValue(entitlement(2));
    mockMe.projectOptions.mockResolvedValue(options(1));
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("3 rooms ready")).toBeTruthy());
    expect(screen.getByText("1 of your shop's 3 rooms used · 1 you bought")).toBeTruthy();
    expect(screen.getByText("3 rooms left")).toBeTruthy();
    expect(screen.getByText("12 AI credits")).toBeTruthy();
    expect(screen.getByText(/Good (morning|afternoon|evening), Priya/)).toBeTruthy();
    press("Start a new room");
    await waitFor(() => expect(screen).toHavePathname("/room/new"));
  });

  it("exhausted: a shop customer is sent to ask the shop, never to buy", async () => {
    signedInAs(person());
    mockMe.entitlement.mockResolvedValue(entitlement(0));
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("All 3 of your shop's rooms used")).toBeTruthy());
    expect(screen.queryByText(/Buy a room/)).toBeNull();
    press("Ask your shop for another room");
    await waitFor(() => expect(screen).toHavePathname("/balance"));
  });

  it("missing: buy one at its price, or add a shop code", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("No rooms yet")).toBeTruthy());
    expect(screen.getByText("Buy a room — ₹199")).toBeTruthy();
    expect(screen.getByText(/A room is ₹199 and stays open for 30 days/)).toBeTruthy();
    press("I have a shop code");
    await waitFor(() => expect(screen).toHavePathname("/add-shop-code"));
  });

  it("says nothing about rooms when the balance cannot be read — never 0 rooms", async () => {
    signedInAs(person());
    mockMe.entitlement.mockRejectedValue(new ApiError("network", 0, "offline"));
    mockMe.projectOptions.mockRejectedValue(new ApiError("network", 0, "offline"));
    mockMe.aiCredits.mockRejectedValue(new ApiError("network", 0, "offline"));
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("Find a painter or a shop near you")).toBeTruthy());
    expect(screen.queryByText(/rooms? left/)).toBeNull();
    expect(screen.queryByText("No rooms yet")).toBeNull();
  });

  it("hides AI credits an account cannot hold", async () => {
    signedInAs(person());
    mockMe.aiCredits.mockResolvedValue({ balance: 0, eligible: false });
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("No rooms left")).toBeTruthy());
    expect(screen.queryByText(/AI credit/)).toBeNull();
  });

  it("lists rooms in progress and opens one at its step", async () => {
    signedInAs(person());
    mockMe.entitlement.mockResolvedValue(entitlement(1));
    mockMe.projects.mockResolvedValue([room(), room({ id: "p2", name: "Old room", closedAt: "2026-09-01T10:00:00" })]);
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("Rooms in progress")).toBeTruthy());
    expect(screen.getByText("Living room")).toBeTruthy();
    expect(screen.getByText("Ready to paint")).toBeTruthy();
    expect(screen.queryByText("Old room")).toBeNull();
    press("Living room");
    await waitFor(() => expect(screen).toHavePathname("/room/p1"));
  });

  it("shows the ready-made rooms only when the library has some", async () => {
    signedInAs(person());
    mockLibrary.list.mockResolvedValue([libraryRoom]);
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("Sunlit lounge")).toBeTruthy());
    expect(screen.getByText("Or paint a ready-made room, free")).toBeTruthy();
    press("Sunlit lounge");
    await waitFor(() => expect(screen).toHavePathname("/library/sunlit-lounge"));
  });
});

// ── C3 Catalogue ──────────────────────────────────────────────────────────────

describe("C3 · Catalogue", () => {
  it("shows every shade by its HV code, grouped by company", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByText("HV0002")).toBeTruthy());
    expect(screen.getByText("4 shades")).toBeTruthy();
    expect(screen.getAllByText("Berger").length).toBeGreaterThan(0);
  });

  it("searches by code and by colour, and says when nothing matches", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByText("HV0002")).toBeTruthy());
    type("Search shades", "hv0003");
    await waitFor(() => expect(screen.queryByText("HV0002")).toBeNull());
    expect(screen.getByText("HV0003")).toBeTruthy();
    type("Search shades", "yellow");
    await waitFor(() => expect(screen.getByText("HV0002")).toBeTruthy());
    type("Search shades", "zzzz");
    await waitFor(() => expect(screen.getByText(/No shade matches “zzzz”/)).toBeTruthy());
  });

  it("filters by company", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByText("HV0002")).toBeTruthy());
    fireEvent.press(screen.getByRole("button", { name: "Berger" }));
    await waitFor(() => expect(screen.queryByText("HV0002")).toBeNull());
    expect(screen.getByText("HV0004")).toBeTruthy();
    expect(screen.getByText("Clear filters")).toBeTruthy();
  });

  it("opens a shade's own page", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByText("HV0002")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Shade HV0002"));
    await waitFor(() => expect(screen).toHavePathname("/shade/asian-paints/HV0002"));
  });

  it("works offline from the copy kept on the phone", async () => {
    signedInAs(person());
    const { mapToPaintShade } = jest.requireActual("@/lib/shade-mapping") as typeof import("@/lib/shade-mapping");
    await AsyncStorage.setItem(
      "hv.catalogue",
      JSON.stringify({ userId: "u1", savedAt: 1, packed: encodeShades(SHADES.map(mapToPaintShade)), brands: BRANDS }),
    );
    mockShades.mine.mockRejectedValue(new ApiError("network", 0, "offline"));
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByText("HV0003")).toBeTruthy());
  });

  it("never shows another account's kept copy", async () => {
    signedInAs(person());
    const { mapToPaintShade } = jest.requireActual("@/lib/shade-mapping") as typeof import("@/lib/shade-mapping");
    await AsyncStorage.setItem(
      "hv.catalogue",
      JSON.stringify({ userId: "someone-else", savedAt: 1, packed: encodeShades(SHADES.map(mapToPaintShade)), brands: BRANDS }),
    );
    mockShades.mine.mockRejectedValue(new ApiError("network", 0, "offline"));
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    expect(screen.queryByText("HV0003")).toBeNull();
  });

  it("explains an empty catalogue", async () => {
    signedInAs(person());
    mockShades.mine.mockResolvedValue([]);
    mockShades.myBrands.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByText("No shades to show yet")).toBeTruthy());
  });
});

// ── C19 Shade detail ──────────────────────────────────────────────────────────

describe("C19 · Shade detail", () => {
  it("shows the code to read out, and never the company to a customer", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/shade/asian-paints/HV0002" });
    await waitFor(() => expect(screen.getByText("HV0002")).toBeTruthy());
    expect(screen.getByText("Yellows & golds · Yellows")).toBeTruthy();
    expect(screen.getByText(/Light · Reflects 62% of light/)).toBeTruthy();
    expect(screen.queryByText("Company")).toBeNull();
  });

  it("prints the company when the scheme allows it", async () => {
    signedInAs(person());
    mockShades.scheme.mockResolvedValue({});
    renderRouter("./app", { initialUrl: "/shade/asian-paints/HV0002" });
    await waitFor(() => expect(screen.getByText("Company")).toBeTruthy());
    expect(screen.getByText("Asian Paints")).toBeTruthy();
  });

  it("copies the code on a long press", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/shade/asian-paints/HV0002" });
    await waitFor(() => expect(screen.getByText("HV0002")).toBeTruthy());
    fireEvent(screen.getByLabelText(/Shade code H V 0 0 0 2/), "longPress");
    await waitFor(() => expect(mockCopy).toHaveBeenCalledWith("HV0002"));
    expect(screen.getByText("Code copied.")).toBeTruthy();
  });

  it("with no room open, trying it on a room starts a new one", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/shade/asian-paints/HV0002" });
    await waitFor(() => expect(screen.getByText("Try it on a room")).toBeTruthy());
    press("Try it on a room");
    await waitFor(() => expect(screen).toHavePathname("/room/new"));
  });

  it("with rooms open, asks which one", async () => {
    signedInAs(person());
    mockMe.projects.mockResolvedValue([room()]);
    renderRouter("./app", { initialUrl: "/shade/asian-paints/HV0002" });
    await waitFor(() => expect(screen.getByText("Try it on a room")).toBeTruthy());
    press("Try it on a room");
    await waitFor(() => expect(screen.getByText("Which room?")).toBeTruthy());
    press("Living room");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/paint"));
  });

  it("says so when the shade cannot be found", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/shade/asian-paints/HV9999" });
    await waitFor(() => expect(screen.getByText("We couldn't find this shade")).toBeTruthy());
  });
});

// ── C20–C21 Ready-made rooms ──────────────────────────────────────────────────

describe("C20–C21 · Ready-made rooms", () => {
  it("paints a ready-made room free, straight on the paint step", async () => {
    signedInAs(person());
    mockLibrary.list.mockResolvedValue([libraryRoom]);
    mockLibrary.start.mockResolvedValue({ projectId: "p9", name: "Sunlit lounge", status: "SEGMENTED", regionCount: 3 });
    renderRouter("./app", { initialUrl: "/library" });
    await waitFor(() => expect(screen.getByText("Sunlit lounge")).toBeTruthy());
    press("Sunlit lounge");
    await waitFor(() => expect(screen.getByText("Paint this room")).toBeTruthy());
    expect(screen.getByText("Free — it doesn't use one of your rooms.")).toBeTruthy();
    expect(screen.getByText("Feature wall")).toBeTruthy();
    press("Paint this room");
    await waitFor(() => expect(screen).toHavePathname("/room/p9/paint"));
    expect(mockLibrary.start).toHaveBeenCalledWith("sunlit-lounge");
  });

  it("says a room has gone when its link no longer opens anything", async () => {
    signedInAs(person());
    mockLibrary.get.mockRejectedValue(new ApiError("http", 404, "Not found"));
    renderRouter("./app", { initialUrl: "/library/gone-room" });
    await waitFor(() => expect(screen.getByText("This room isn't available any more")).toBeTruthy());
  });

  it("explains an empty shelf", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/library" });
    await waitFor(() => expect(screen.getByText("No ready-made rooms right now")).toBeTruthy());
  });
});

// ── C30 Add a shop code ───────────────────────────────────────────────────────

describe("C30 · Add a shop code", () => {
  it("takes the code out of a pasted WhatsApp message and adds the shop's rooms", async () => {
    signedInAs(person());
    mockMe.redeemCode.mockResolvedValue({ id: "c1", code: "7K2NQ9PX", organizationId: "o1", organizationName: "Sharma Paints", projectQuota: 3, projectsRemaining: 3 });
    renderRouter("./app", { initialUrl: "/add-shop-code" });
    await waitFor(() => expect(screen.getByText("Add a shop code")).toBeTruthy());
    const before = mockMe.entitlement.mock.calls.length;
    fireEvent.changeText(screen.getByTestId("shop-code"), "Your HueVistaa code: 7K2NQ9PX. Open huevistaa.com/unlock");
    press("Add code");
    await waitFor(() => expect(screen.getByText("Sharma Paints gave you 3 rooms.")).toBeTruthy());
    expect(mockMe.redeemCode).toHaveBeenCalledWith("7K2NQ9PX");
    expect(mockMe.entitlement.mock.calls.length).toBeGreaterThanOrEqual(before);
  });

  it("puts an unknown code in plain words", async () => {
    signedInAs(person());
    mockMe.redeemCode.mockRejectedValue(new ApiError("http", 404, "Access code not found: 7K2NQ9PX"));
    renderRouter("./app", { initialUrl: "/add-shop-code" });
    await waitFor(() => expect(screen.getByText("Add a shop code")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("shop-code"), "7K2NQ9PX");
    press("Add code");
    await waitFor(() => expect(screen.getByText(/We don't know that code/)).toBeTruthy());
  });

  it("shows the shop's own reason for a used code", async () => {
    signedInAs(person());
    mockMe.redeemCode.mockRejectedValue(new ApiError("http", 409, "This access code has already been used"));
    renderRouter("./app", { initialUrl: "/add-shop-code" });
    await waitFor(() => expect(screen.getByText("Add a shop code")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("shop-code"), "7k2n-q9px");
    press("Add code");
    await waitFor(() => expect(screen.getByText("This access code has already been used")).toBeTruthy());
  });
});

// ── C31 My products ───────────────────────────────────────────────────────────

describe("C31 · My products", () => {
  it("lists what the shop unlocked, with a call button", async () => {
    signedInAs(person());
    mockMe.assignedProducts.mockResolvedValue({
      shops: [
        {
          shopId: "s1",
          shopName: "Sharma Paints",
          phone: "+919876543210",
          city: "Pune",
          products: [{ id: "x", lineId: 1, brandName: "Asian Paints", lineName: "Royale Luxury", finish: "Matt", price: 650, priceUnit: "per litre" }],
        },
      ],
    });
    renderRouter("./app", { initialUrl: "/my-products" });
    await waitFor(() => expect(screen.getByText("Royale Luxury")).toBeTruthy());
    expect(screen.getByText("₹650 · per litre")).toBeTruthy();
    expect(screen.getByText("Call Sharma Paints")).toBeTruthy();
  });
});

// ── C5 Account ────────────────────────────────────────────────────────────────

describe("C5 · Account", () => {
  it("shows the sign-in details, and signs out after asking", async () => {
    signedInAs(person({ email: "priya@example.com", emailVerified: false, phoneNumber: "+919876543210", phoneVerified: true }));
    renderRouter("./app", { initialUrl: "/account" });
    await waitFor(() => expect(screen.getByText("Sign-in details")).toBeTruthy());
    expect(screen.getByText("+91 98765 43210 · Verified")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-sign-out"));
    await waitFor(() => expect(screen.getByText("Sign out?")).toBeTruthy());
    pressLast("Sign out");
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(mockAuth.logout).toHaveBeenCalled();
  });

  it("offers painter work only to an account the backend would let become one", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/account" });
    await waitFor(() => expect(screen.getByText("Work as a painter")).toBeTruthy());
  });

  it("hides painter work, and shows My products, for a shop customer", async () => {
    signedInAs(person());
    mockMe.entitlement.mockResolvedValue(entitlement(1));
    renderRouter("./app", { initialUrl: "/account" });
    await waitFor(() => expect(screen.getByText("My products")).toBeTruthy());
    expect(screen.queryByText("Work as a painter")).toBeNull();
  });

  it("a shop's customer profile switches back to the shop, taking the emailed code in place", async () => {
    signedInAs(person({ name: "Sharma Paints", linkedProfile: true, switchTo: "SHOP" }));
    mockAuth.switchProfile.mockResolvedValue({ emailCodeRequired: true, challengeToken: "ch-1", emailHint: "s***@example.com" });
    mockAuth.shopEmailCode.mockResolvedValue({ accessToken: "a-shop", refreshToken: "r-shop" });
    renderRouter("./app", { initialUrl: "/account" });
    await waitFor(() => expect(screen.getByTestId("switch-back")).toBeTruthy());
    expect(screen.queryByText("Sign-in details")).toBeNull();
    fireEvent.press(screen.getByTestId("switch-back"));
    await waitFor(() => expect(screen.getByText("Switch to the shop")).toBeTruthy());
    mockAuth.profile.mockResolvedValue(person({ name: "Sharma Paints", role: "RETAILER", switchTo: "CUSTOMER" }));
    press("Switch to the shop");
    await waitFor(() => expect(screen.getByText("We emailed a code to s***@example.com.")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("switch-code"), "123456");
    await waitFor(() => expect(screen).toHavePathname("/web-only"));
    expect(mockAuth.shopEmailCode).toHaveBeenCalledWith({ challengeToken: "ch-1", code: "123456" });
  });
});

// ── S1–S9 ─────────────────────────────────────────────────────────────────────

describe("S1–S9 · account screens", () => {
  it("S1: seven taps on the version copy the details for support", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/settings" });
    await waitFor(() => expect(screen.getByTestId("settings-version")).toBeTruthy());
    for (let i = 0; i < 7; i++) fireEvent.press(screen.getByTestId("settings-version"));
    await waitFor(() => expect(mockCopy).toHaveBeenCalledWith(expect.stringContaining("Account u1")));
  });

  it("S2: saves a new name", async () => {
    signedInAs(person());
    mockAuth.updateProfile.mockResolvedValue(person({ name: "Priya S" }));
    renderRouter("./app", { initialUrl: "/edit-name" });
    await waitFor(() => expect(screen.getByLabelText("Name").props.value).toBe("Priya Sharma"));
    type("Name", "Priya S");
    press("Save");
    await waitFor(() => expect(screen.getByText("Name saved.")).toBeTruthy());
    expect(mockAuth.updateProfile).toHaveBeenCalledWith({ name: "Priya S" });
  });

  it("S3: adds an email with a code sent to it", async () => {
    signedInAs(person());
    mockAuth.sendEmailCode.mockResolvedValue({ channel: "EMAIL", destination: "p***@example.com", expiresInSeconds: 600, cooldownSeconds: 30 });
    mockAuth.confirmEmailCode.mockResolvedValue(person({ email: "priya@example.com", emailVerified: true }));
    renderRouter("./app", { initialUrl: "/verify-email" });
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeTruthy());
    type("Email", "priya@example.com");
    press("Send code");
    await waitFor(() => expect(screen.getByText("We emailed a code to p***@example.com.")).toBeTruthy());
    expect(mockAuth.sendEmailCode).toHaveBeenCalledWith("priya@example.com");
    fireEvent.changeText(screen.getByTestId("verify-code"), "123456");
    await waitFor(() => expect(screen.getByText("Email confirmed.")).toBeTruthy());
    expect(mockAuth.confirmEmailCode).toHaveBeenCalledWith("123456");
  });

  it("S4: changes a confirmed number through a code sent to the new one", async () => {
    signedInAs(person({ phoneNumber: "+919876543210", phoneVerified: true }));
    mockAuth.sendPhoneCode.mockResolvedValue({ channel: "PHONE", destination: "*******0123", expiresInSeconds: 300, cooldownSeconds: 30 });
    renderRouter("./app", { initialUrl: "/mobile-number" });
    await waitFor(() => expect(screen.getByText("Change number")).toBeTruthy());
    expect(screen.getByText(/This number signs you in/)).toBeTruthy();
    press("Change number");
    type(/New number/, "9123450123");
    press("Send code");
    await waitFor(() => expect(screen.getByText("We texted a code to *******0123.")).toBeTruthy());
    expect(mockAuth.sendPhoneCode).toHaveBeenCalledWith("+919123450123");
  });

  it("S5: a changed password signs out everywhere and lands on email sign-in, without a second logout", async () => {
    signedInAs(person({ email: "priya@example.com", emailVerified: true, hasPassword: true }));
    renderRouter("./app", { initialUrl: "/password" });
    await waitFor(() => expect(screen.getByLabelText("Current password")).toBeTruthy());
    type("Current password", "oldpass123");
    type("New password", "newpass456");
    press("Save password");
    await waitFor(() => expect(screen).toHavePathname("/email-sign-in"));
    expect(mockAuth.changePassword).toHaveBeenCalledWith({ currentPassword: "oldpass123", newPassword: "newpass456" });
    expect(mockAuth.logout).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email").props.value).toBe("priya@example.com");
    expect(screen.getByText("Password changed. Sign in with the new one.")).toBeTruthy();
  });

  it("S5: a Google account has no password to set", async () => {
    signedInAs(person({ provider: "GOOGLE", email: "priya@gmail.com", emailVerified: true }));
    renderRouter("./app", { initialUrl: "/password" });
    await waitFor(() => expect(screen.getByText(/You sign in with Google/)).toBeTruthy());
    expect(screen.queryByText("Save password")).toBeNull();
  });

  it("S5: a first password needs a confirmed email first", async () => {
    signedInAs(person({ phoneNumber: "+919876543210", phoneVerified: true }));
    renderRouter("./app", { initialUrl: "/password" });
    await waitFor(() => expect(screen.getByText(/confirm an email first/)).toBeTruthy());
    press("Add or confirm an email");
    await waitFor(() => expect(screen).toHavePathname("/verify-email"));
  });

  it("S9: deletes only after the tick, then lands on Welcome", async () => {
    signedInAs(person());
    renderRouter("./app", { initialUrl: "/delete-account" });
    await waitFor(() => expect(screen.getByText("Delete my account")).toBeTruthy());
    expect(screen.getByText("Your colour boards")).toBeTruthy();
    press("Delete my account");
    expect(mockAuth.deleteAccount).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("delete-understand"));
    press("Delete my account");
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(mockAuth.deleteAccount).toHaveBeenCalled();
    expect(mockAuth.logout).not.toHaveBeenCalled();
    expect(mockSecure["hv.refresh"]).toBeUndefined();
  });
});
