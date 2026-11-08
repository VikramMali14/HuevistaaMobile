/**
 * Phase 7 through the REAL route tree: painters and shops near you (C32), reviewing the
 * job (C26, D1), help and support (S6, S7), questions and answers (S8) and a shared room
 * (D2). Only the network, the secure store, the phone's location, the dialler and the
 * browser are faked (and the GPU, as everywhere in Jest).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onlineManager } from "@tanstack/react-query";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { AccessibilityInfo, Linking } from "react-native";

import { ApiError } from "@/api/errors";
import type { BoardReviewState, MyQuestions, OwnQuestion, QuestionPage } from "@/api/endpoints/community";
import type { NearbyPainter, NearbyPlace, NearbyShop, WorkAreas } from "@/api/endpoints/nearby";
import type { SharedRoom } from "@/api/endpoints/share";
import type { Conversation, ConversationSummary } from "@/api/endpoints/support";
import { queryClient } from "@/api/query-client";
import type { UserProfile } from "@/api/types";
import { forgetRememberedRoute, peekRememberedRoute } from "@/auth/pending-route";

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
const mockBrowser = { openAuthSessionAsync: jest.fn(), openBrowserAsync: jest.fn(async (_url: string) => ({})) };
jest.mock("expo-web-browser", () => mockBrowser);
jest.mock("@/features/studio/engine/texture-loader", () => ({
  loadTexture: jest.fn(async () => ({ pixels: { localUri: "file://x" }, width: 800, height: 600 })),
  loadBundledTexture: jest.fn(async () => ({ pixels: { localUri: "file://x" }, width: 800, height: 600 })),
  clearStudioCache: jest.fn(),
}));

const mockLocation = {
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
};
jest.mock("expo-location", () => mockLocation);

const mockAuth = { profile: jest.fn<Promise<UserProfile>, []>(), logout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));
const mockNever = () => new Promise<never>(() => {});
jest.mock("@/api/endpoints/me", () => ({
  meApi: new Proxy({}, { get: () => () => new Promise<never>(() => {}) }),
}));
const mockNearby = { painters: jest.fn(), shops: jest.fn(), painterPhone: jest.fn(), places: jest.fn(), workAreas: jest.fn(), where: jest.fn() };
jest.mock("@/api/endpoints/nearby", () => ({
  get nearbyApi() {
    return mockNearby;
  },
}));
const mockCommunity = {
  questions: jest.fn<Promise<QuestionPage>, [number, number?]>(),
  myQuestions: jest.fn<Promise<MyQuestions>, []>(),
  ask: jest.fn<Promise<OwnQuestion>, [string, string]>(),
  boardReview: jest.fn<Promise<BoardReviewState>, [string]>(),
  submitReview: jest.fn(),
  boardForProject: jest.fn(),
};
jest.mock("@/api/endpoints/community", () => ({
  get communityApi() {
    return mockCommunity;
  },
}));
const mockSupport = {
  conversations: jest.fn<Promise<ConversationSummary[]>, []>(),
  conversation: jest.fn<Promise<Conversation>, [string]>(),
  start: jest.fn<Promise<Conversation>, [string]>(),
  send: jest.fn<Promise<Conversation>, [string, string]>(),
  requestHuman: jest.fn<Promise<Conversation>, [string]>(),
};
jest.mock("@/api/endpoints/support", () => ({
  get supportApi() {
    return mockSupport;
  },
}));
const mockShare = {
  room: jest.fn<Promise<SharedRoom>, [string]>(),
  brands: jest.fn(),
  shades: jest.fn(),
  claim: jest.fn(),
  maskPath: (token: string, id: number) => `/api/share/${token}/regions/${id}/mask`,
};
jest.mock("@/api/endpoints/share", () => ({
  get shareApi() {
    return mockShare;
  },
}));
const mockProjects = { get: jest.fn(), maskPath: (id: string, r: number) => `/api/projects/${id}/regions/${r}/mask` };
jest.mock("@/api/endpoints/projects", () => ({
  get projectsApi() {
    return mockProjects;
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOARD = "0VkTlzUw5CGJ-bTtxixeiS0nVfg";
const SHARE = "0123456789abcdef0123456789abcdef";
const DAY = 86_400_000;
const ist = (fromNow: number) => new Date(Date.now() + fromNow + 5.5 * 3600_000).toISOString().slice(0, 19);
const offline = () => new ApiError("network", 0, "offline");

function signedInAs(role: UserProfile["role"] | null) {
  if (!role) return;
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Priya Sharma", provider: "LOCAL", role, phoneNumber: "+919876543210" });
}

const painterRow = (id: string, extra: Partial<NearbyPainter> = {}): NearbyPainter => ({
  id,
  name: "Ravi Kumar",
  photoUrl: `/api/nearby/painters/${id}/photo?v=1730000000000`,
  address: "Vaishali Nagar, Ajmer",
  rating: 4.6,
  ratingCount: 23,
  jobsCompleted: 3,
  certified: true,
  // A search by state or division is from no point: no distance.
  distanceKm: null,
  place: "Ajmer, Rajasthan",
  ...extra,
});
/** Where HueVistaa is open, as the server names it: Rajasthan, cut down to three of its divisions. */
const RAJASTHAN: WorkAreas["states"][number] = {
  code: "RJ",
  name: "Rajasthan",
  nameHi: "राजस्थान",
  divisions: [
    { code: "RJ-AJMER", name: "Ajmer", nameHi: "अजमेर", hint: "Bhilwara, Nagaur, Tonk, Beawar", hintHi: "भीलवाड़ा, नागौर, टोंक, ब्यावर" },
    { code: "RJ-JAIPUR", name: "Jaipur", nameHi: "जयपुर", hint: "Alwar, Sikar, Jhunjhunu, Dausa", hintHi: "अलवर, सीकर, झुंझुनू, दौसा" },
    { code: "RJ-KOTA", name: "Kota", nameHi: "कोटा", hint: null, hintHi: null },
  ],
};
const WORK_AREAS: WorkAreas = { anywhere: "IN", states: [RAJASTHAN] };
const shopRow = (extra: Partial<NearbyShop> = {}): NearbyShop => ({
  id: "s1",
  name: "Sharma Paints",
  addressLine: "Shop 4, Kaiser Ganj",
  city: "Ajmer",
  state: "Rajasthan",
  phone: "0145 240 1234",
  openingHours: "9 am – 9 pm",
  latitude: 26.45,
  longitude: 74.64,
  distanceKm: null,
  ...extra,
});
const boardState = (extra: Partial<BoardReviewState> = {}): BoardReviewState => ({
  canReview: true,
  reason: null,
  shopName: "Sharma Paints",
  suggestedName: "Priya S.",
  canEdit: false,
  review: null,
  ...extra,
});
const chat = (id: string, extra: Partial<Conversation> = {}): Conversation => ({
  id,
  channel: "IN_APP",
  status: "OPEN",
  subject: "My payment didn't go through",
  createdAt: ist(-60_000),
  updatedAt: ist(-60_000),
  messages: [
    { id: "m1", sender: "USER", body: "My payment didn't go through", createdAt: ist(-60_000) },
    { id: "m2", sender: "AI", body: "Sorry about that — what's the payment reference?", createdAt: ist(-59_000) },
  ],
  ...extra,
});
const sharedRoom = (extra: Partial<SharedRoom> = {}): SharedRoom => ({
  id: "owner-room",
  name: "Sunita's living room",
  status: "SEGMENTED",
  imageUrl: "https://bucket.s3.amazonaws.com/room.jpg?sig=1",
  cleanedImageUrl: null,
  regions: [
    { id: 11, label: "Main wall", category: "MAIN_WALL", maskUrl: "/api/share/x/regions/11/mask", appliedHexCode: "#7b8a72", appliedHvCode: "HV0348", manual: false, inPlan: true },
    { id: 12, label: "Side wall", category: "OTHER_WALL", maskUrl: "/api/share/x/regions/12/mask", appliedHexCode: null, appliedHvCode: null, manual: false, inPlan: true },
  ],
  sharedBrands: [],
  shadeCodeScheme: { showNames: false, showBrands: false, showRealCodes: false },
  shareExpiresAt: ist(3 * DAY),
  ...extra,
});

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  for (const group of [mockNearby, mockCommunity, mockSupport, mockShare, mockProjects, mockLocation]) {
    for (const fn of Object.values(group)) if (typeof fn === "function" && "mockReset" in fn) (fn as jest.Mock).mockReset();
  }
  mockLocation.hasServicesEnabledAsync.mockResolvedValue(true);
  mockLocation.getLastKnownPositionAsync.mockResolvedValue(null);
  mockNearby.workAreas.mockResolvedValue(WORK_AREAS);
  mockNearby.where.mockResolvedValue({ name: null, state: null, division: null });
  mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  mockAuth.profile.mockReset();
  mockBrowser.openBrowserAsync.mockClear();
  openURL.mockClear();
  openSettings.mockClear();
  forgetRememberedRoute();
  queryClient.clear();
  await AsyncStorage.clear();
});

const tick = (ms = 50) => act(async () => jest.advanceTimersByTime(ms));

// ── C32 · Find a painter · C36 · Find a paint shop ────────────────────────────

describe("C32 · Find a painter, and C36 · Find a paint shop", () => {
  /** Rajasthan, then its Ajmer division. */
  const IN_AJMER = { state: "RJ", division: "RJ-AJMER" };

  /** Chooses a state from the list the State box opens. */
  const chooseState = async (code = "RJ") => {
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeEnabled());
    fireEvent.press(screen.getByTestId("nearby-state"));
    await waitFor(() => expect(screen.getByTestId(`nearby-state-${code}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId(`nearby-state-${code}`));
  };

  /** Chooses a division from the list the Division box opens — null for all of the state. */
  const chooseDivision = async (code: string | null) => {
    await waitFor(() => expect(screen.getByTestId("nearby-division")).toBeEnabled());
    fireEvent.press(screen.getByTestId("nearby-division"));
    const row = code ? `nearby-division-${code}` : "nearby-division-all";
    await waitFor(() => expect(screen.getByTestId(row)).toBeTruthy());
    fireEvent.press(screen.getByTestId(row));
  };

  /** The search most tests start from: Rajasthan, then the Ajmer division. */
  const searchAjmer = async () => {
    await chooseState("RJ");
    await chooseDivision("RJ-AJMER");
  };

  /** Ajmer's PIN code as the server finds it: the middle of its post offices, its state and division. */
  const AJMER_PIN: NearbyPlace = {
    name: "305001",
    region: "Ajmer, Rajasthan",
    pincode: "305001",
    latitude: 26.4517,
    longitude: 74.6369,
    state: "RJ",
    division: "RJ-AJMER",
  };
  const NEAR_AJMER_PIN = { state: "RJ", lat: 26.4517, lon: 74.6369 };

  /** Types a PIN code in its box and presses Search. */
  const searchPin = async (typed: string) => {
    await waitFor(() => expect(screen.getByTestId("nearby-pin")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("nearby-pin"), typed);
    // The lookup answers at once here; let it land inside act, as a person's wait would.
    await act(async () => fireEvent.press(screen.getByTestId("nearby-pin-search")));
  };

  it("asks for the state, then the division, and never for the phone's location", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([painterRow("p1"), painterRow("p2", { name: null, jobsCompleted: 0, rating: null, ratingCount: 0 })]);
    mockNearby.shops.mockResolvedValue([shopRow()]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-ask")).toBeTruthy());
    expect(screen.getByText(/Choose your state to see everyone in it/)).toBeTruthy();
    expect(screen.queryByTestId("nearby-locate")).toBeNull();
    expect(screen.queryByText(/my location/i)).toBeNull();
    // Nothing else to type: no town box, only one for a PIN code, if the customer would rather.
    expect(screen.queryByTestId("nearby-place")).toBeNull();
    expect(screen.getByTestId("nearby-pin")).toBeTruthy();
    // The division waits for a state.
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toHaveTextContent(/Choose your state/));
    expect(screen.getByTestId("nearby-division")).toBeDisabled();
    expect(screen.getByTestId("nearby-division")).toHaveTextContent(/Choose your state first/);

    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("nearby-painters")).toBeTruthy());
    expect(screen.getByTestId("nearby-state")).toHaveTextContent(/Rajasthan/);
    expect(screen.getByTestId("nearby-division")).toHaveTextContent(/Ajmer/);
    expect(mockNearby.painters).toHaveBeenCalledWith({ state: "RJ" });
    expect(mockNearby.painters).toHaveBeenLastCalledWith(IN_AJMER);
    expect(screen.getByTestId("nearby-in")).toHaveTextContent("In Ajmer, Rajasthan");
    expect(mockNearby.places).not.toHaveBeenCalled();
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockLocation.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    // Where each painter is based, to the district — not how far away, nor their jobs and reviews.
    expect(screen.getByTestId("painter-place-p1")).toHaveTextContent("Ajmer, Rajasthan");
    expect(within(screen.getByTestId("nearby-painters")).queryByText(/km away|m away/)).toBeNull();
    expect(screen.queryByText(/jobs? done|reviews?|New on HueVistaa/)).toBeNull();
    // The painter's card: photo, name and address — and the number when Call is pressed.
    expect(screen.getByLabelText("Photo of Ravi Kumar")).toBeTruthy();
    expect(screen.getByTestId("painter-address-p1")).toHaveTextContent("Vaishali Nagar, Ajmer");
    // Only certified painters are listed, and each card says so.
    expect(screen.getAllByText("HueVistaa Certified")).toHaveLength(2);
    // Painters alone: no switch to shops on this screen, and no shops asked for.
    expect(screen.getByText("Find a painter")).toBeTruthy();
    expect(screen.queryByText(/^Shops/)).toBeNull();
    expect(mockNearby.shops).not.toHaveBeenCalled();
  });

  it("searches nothing on arrival", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeEnabled());
    await tick();
    expect(mockNearby.painters).not.toHaveBeenCalled();
  });

  /** The state alone is all of it, at once; its divisions are offered with the big towns in each. */
  it("searches the whole state at once, and offers its divisions with their towns", async () => {
    signedInAs("CUSTOMER");
    mockNearby.shops.mockResolvedValue([shopRow({ place: "Ajmer, Rajasthan" })]);
    renderRouter("./app", { initialUrl: "/shops" });
    await chooseState("RJ");
    await waitFor(() => expect(screen.getByTestId("nearby-shops")).toBeTruthy());
    expect(mockNearby.shops).toHaveBeenCalledWith({ state: "RJ" });
    expect(screen.getByTestId("nearby-all-of")).toHaveTextContent("In all of Rajasthan");
    expect(screen.getByTestId("nearby-division")).toHaveTextContent(/All of Rajasthan/);
    expect(screen.queryByText(/away/)).toBeNull();

    fireEvent.press(screen.getByTestId("nearby-division"));
    await waitFor(() => expect(screen.getByTestId("nearby-division-RJ-AJMER")).toBeTruthy());
    expect(screen.getByTestId("nearby-division-all")).toHaveTextContent(/All of Rajasthan/);
    expect(screen.getByTestId("nearby-division-RJ-AJMER")).toHaveTextContent(/Ajmer.*Bhilwara, Nagaur, Tonk, Beawar/);
    // No towns given: just its name.
    expect(screen.getByTestId("nearby-division-RJ-KOTA")).toHaveTextContent(/Kota/);
    expect(screen.getByTestId("nearby-division-RJ-KOTA")).not.toHaveTextContent(/,/);
  });

  it("narrows to a division, and back to the whole state", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();
    await waitFor(() => expect(mockNearby.painters).toHaveBeenLastCalledWith(IN_AJMER));
    await waitFor(() => expect(screen.getByTestId("nearby-in")).toHaveTextContent("In Ajmer, Rajasthan"));

    await chooseDivision(null);
    await waitFor(() => expect(screen.getByTestId("nearby-all-of")).toHaveTextContent("In all of Rajasthan"));
    expect(screen.queryByTestId("nearby-in")).toBeNull();
  });

  /** Paint shops are a screen of their own, pushed over the tabs, with a way back. */
  it("lists paint shops on a screen of their own, with directions", async () => {
    signedInAs("CUSTOMER");
    mockNearby.shops.mockResolvedValue([shopRow()]);
    renderRouter("./app", { initialUrl: "/shops" });
    await waitFor(() => expect(screen.getByTestId("nearby-ask")).toBeTruthy());
    expect(screen.getByText("Find a paint shop")).toBeTruthy();
    expect(screen.getByText("Find a paint shop near you.")).toBeTruthy();
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("nearby-shops")).toBeTruthy());
    expect(mockNearby.shops).toHaveBeenLastCalledWith(IN_AJMER);
    expect(mockNearby.painters).not.toHaveBeenCalled();
    expect(screen.getByText("Shop 4, Kaiser Ganj · Ajmer, Rajasthan")).toBeTruthy();
    expect(screen.getByText("Open 9 am – 9 pm")).toBeTruthy();
    fireEvent.press(screen.getByTestId("directions-s1"));
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining("26.45,74.64"));
  });

  /**
   * A shop's card, like a painter's: the district and state it is in, from its pin, and where it
   * serves — and one found from further off, because it serves the division chosen, says so.
   */
  it("says where each shop is and where it serves, and marks one that serves your area", async () => {
    signedInAs("CUSTOMER");
    mockNearby.shops.mockResolvedValue([
      shopRow({ place: "Ajmer, Rajasthan", serviceAreas: ["RJ-AJMER", "RJ-KOTA"] }),
      shopRow({
        id: "s2",
        name: "Jaipur Paint House",
        addressLine: "MI Road",
        city: "Jaipur",
        place: "Jaipur, Rajasthan",
        serviceAreas: ["RJ"],
        servesYourArea: true,
      }),
    ]);
    renderRouter("./app", { initialUrl: "/shops" });
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("nearby-shops")).toBeTruthy());

    expect(screen.getByTestId("shop-place-s1")).toHaveTextContent("Ajmer, Rajasthan");
    // The street, without the district said twice.
    expect(screen.getByText("Shop 4, Kaiser Ganj")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("shop-areas-s1")).toHaveTextContent("Serves Ajmer, Kota (Rajasthan)"));
    expect(screen.queryByTestId("shop-serves-here-s1")).toBeNull();

    expect(screen.getByTestId("shop-place-s2")).toHaveTextContent("Jaipur, Rajasthan");
    expect(screen.getByTestId("shop-areas-s2")).toHaveTextContent("Serves Rajasthan");
    expect(screen.getByTestId("shop-serves-here-s2")).toBeTruthy();
  });

  /** Two places, two tiles on Home: who will paint it, and where to buy the paint. */
  it("offers Find a painter and Find a paint shop as two tiles on Home", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByText("Find a paint shop")).toBeTruthy());
    expect(screen.getByText("Find a painter")).toBeTruthy();
    fireEvent.press(screen.getByText("Find a paint shop"));
    await waitFor(() => expect(screen).toHavePathname("/shops"));
  });

  it("sends an old Shops link to the shops screen", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/nearby?tab=shops" });
    await waitFor(() => expect(screen.getByText("Find a paint shop near you.")).toBeTruthy());
    expect(screen).toHavePathname("/shops");
  });

  // It was a card on Home; it is a tab of its own now, beside Boards and Account.
  it("is a tab of its own, and no longer a card on Home", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getByTestId("tab-nearby")).toBeTruthy());
    expect(screen.queryByText("Find a painter or a shop near you")).toBeNull();
    fireEvent.press(screen.getByTestId("tab-nearby"));
    await waitFor(() => expect(screen).toHavePathname("/nearby"));
    expect(screen.getByText("Find a painter near you.")).toBeTruthy();
  });

  // An old "Shops" link can arrive while the Painters tab is already up.
  it("sends ?tab=shops to the shops screen even while the Painters tab is up", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByText("Find a painter near you.")).toBeTruthy());
    act(() => router.push({ pathname: "/nearby", params: { tab: "shops" } }));
    await waitFor(() => expect(screen.getByText("Find a paint shop near you.")).toBeTruthy());
    expect(screen).toHavePathname("/shops");
  });

  // Each number asked for counts against 20 a day — never asked twice.
  it("asks for a painter's number only on Call, dials it, and keeps it", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    mockNearby.shops.mockResolvedValue([]);
    mockNearby.painterPhone.mockResolvedValue({ id: "p1", phone: "+919829012345" });
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("call-p1")).toBeTruthy());
    expect(mockNearby.painterPhone).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("call-p1"));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith("tel:+919829012345"));
    expect(screen.getByTestId("phone-p1")).toHaveTextContent(/\+91.98290.12345/);
    expect(screen.getByTestId("whatsapp-p1")).toBeTruthy();
    fireEvent.press(screen.getByTestId("call-p1"));
    await tick();
    expect(mockNearby.painterPhone).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledTimes(2);
  });

  it("says a painter can't be reached in the server's words", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    mockNearby.shops.mockResolvedValue([]);
    mockNearby.painterPhone.mockRejectedValue(new ApiError("http", 404, "This painter isn't taking customers through HueVistaa just now."));
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("call-p1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("call-p1"));
    await waitFor(() => expect(screen.getByTestId("call-error-p1")).toHaveTextContent(/isn't taking customers/));
    expect(openURL).not.toHaveBeenCalled();
  });

  // Offline, the ask fails at once — a paused one would dial by itself once the signal came back.
  it("says at once that Call needs a connection, and never dials later by itself", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    mockNearby.shops.mockResolvedValue([]);
    mockNearby.painterPhone.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("call-p1")).toBeTruthy());
    act(() => onlineManager.setOnline(false));
    try {
      fireEvent.press(screen.getByTestId("call-p1"));
      await waitFor(() => expect(screen.getByTestId("call-error-p1")).toBeTruthy());
      expect(mockNearby.painterPhone).toHaveBeenCalledTimes(1);
      mockNearby.painterPhone.mockResolvedValue({ id: "p1", phone: "+919829012345" });
      act(() => onlineManager.setOnline(true));
      await tick(1_000);
      expect(openURL).not.toHaveBeenCalled();
    } finally {
      act(() => onlineManager.setOnline(true));
    }
  });

  // No distance to pick or shown, as on the website — and nobody listed there yet is "Coming soon".
  it("names no distance, and says painters are coming soon to the division when none is listed", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([]);
    mockNearby.shops.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeTruthy());
    expect(screen.queryByTestId("radius-10")).toBeNull();
    expect(screen.queryByTestId("nearby-within")).toBeNull();
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("nearby-coming-soon")).toHaveTextContent("Coming soon"));
    expect(screen.getByText("Painters in Ajmer are coming soon.")).toBeTruthy();
    // In a division: the way to the whole state.
    expect(screen.getByTestId("nearby-or-all-of")).toHaveTextContent("Or choose “All of Rajasthan” to see everyone in the state.");
    expect(screen.queryByText(/\bkm\b/)).toBeNull();
    // The state when it was chosen, then the division in it.
    expect(mockNearby.painters).toHaveBeenCalledTimes(2);
  });

  it("says paint shops are coming soon to the whole state", async () => {
    signedInAs("CUSTOMER");
    mockNearby.shops.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/shops" });
    await chooseState("RJ");
    await waitFor(() => expect(screen.getByText("Paint shops in Rajasthan are coming soon.")).toBeTruthy());
    expect(screen.queryByTestId("nearby-or-all-of")).toBeNull();
  });

  // Where each painter can go for a job, named by the server's catalogue; nothing when they haven't said.
  it("says where each painter can work", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([
      painterRow("p1", { workAreas: ["RJ-AJMER", "RJ-JAIPUR"] }),
      painterRow("p2", { workAreas: ["RJ"] }),
      painterRow("p3", { workAreas: [] }),
    ]);
    mockNearby.shops.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("painter-areas-p1")).toHaveTextContent("Works in Ajmer, Jaipur (Rajasthan)"));
    expect(screen.getByTestId("painter-areas-p2")).toHaveTextContent("Works in Rajasthan");
    expect(screen.queryByTestId("painter-areas-p3")).toBeNull();
  });

  /** A painter further off who said they work in the division comes after the ones based there, and says why. */
  it("marks a painter who works in the division chosen", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockResolvedValue([
      painterRow("p1"),
      painterRow("p2", { place: "Jaipur, Rajasthan", workAreas: ["RJ-AJMER"], worksInYourArea: true }),
    ]);
    mockNearby.shops.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();

    await waitFor(() => expect(screen.getByTestId("painter-works-here-p2")).toHaveTextContent("Works in your area"));
    expect(screen.getByTestId("painter-place-p2")).toHaveTextContent("Jaipur, Rajasthan");
    expect(screen.queryByTestId("painter-works-here-p1")).toBeNull();
  });

  // The allowance is small and shared: a refusal is said, never tried again by itself.
  it("shows a refusal in the server's words and doesn't ask again", async () => {
    signedInAs("CUSTOMER");
    mockNearby.painters.mockRejectedValue(new ApiError("http", 429, "Too many of these from your account. Please wait a while and try again."));
    mockNearby.shops.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();
    await waitFor(() => expect(screen.getByText(/Too many of these from your account/)).toBeTruthy());
    for (let i = 0; i < 4; i++) await tick(10_000);
    // Once for the state, once for the division: neither tried again.
    expect(mockNearby.painters).toHaveBeenCalledTimes(2);
  });

  /** A new state is a new search: the last one's division no longer answers it. */
  it("starts the division again when the state changes", async () => {
    signedInAs("CUSTOMER");
    // Should a second state open, one with no divisions is only ever searched whole.
    mockNearby.workAreas.mockResolvedValue({ ...WORK_AREAS, states: [{ code: "CH", name: "Chandigarh", nameHi: "चंडीगढ़", divisions: [] }, RAJASTHAN] });
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchAjmer();
    await waitFor(() => expect(screen.getByTestId("nearby-painters")).toBeTruthy());
    mockNearby.painters.mockResolvedValue([]);
    await chooseState("CH");
    await waitFor(() => expect(mockNearby.painters).toHaveBeenLastCalledWith({ state: "CH" }));
    await waitFor(() => expect(screen.getByText("Painters in Chandigarh are coming soon.")).toBeTruthy());
    expect(screen.queryByTestId("nearby-painters")).toBeNull();
    expect(screen.queryByTestId("nearby-in")).toBeNull();
    expect(screen.getByTestId("nearby-all-of")).toHaveTextContent("In all of Chandigarh");
    expect(screen.getByTestId("nearby-division")).toBeDisabled();
    expect(screen.getByTestId("nearby-division")).toHaveTextContent(/All of Chandigarh/);
  });

  // ── Or a PIN code ──

  /**
   * A PIN typed is looked up and searched near — nearest first — with no state chosen first: the two
   * boxes follow it to its state and division, and India Post is credited for it.
   */
  it("searches near a PIN code typed, and the boxes follow it to its state and division", async () => {
    signedInAs("CUSTOMER");
    mockNearby.places.mockResolvedValue([AJMER_PIN]);
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeEnabled());
    await searchPin("305001");

    await waitFor(() => expect(screen.getByTestId("nearby-painters")).toBeTruthy());
    expect(mockNearby.places).toHaveBeenCalledWith("305001");
    expect(mockNearby.painters).toHaveBeenCalledTimes(1);
    expect(mockNearby.painters).toHaveBeenCalledWith(NEAR_AJMER_PIN);
    expect(screen.getByTestId("nearby-state")).toHaveTextContent(/Rajasthan/);
    expect(screen.getByTestId("nearby-division")).toHaveTextContent(/Ajmer/);
    expect(screen.getByTestId("nearby-near")).toHaveTextContent("Near PIN 305001 · Ajmer, Rajasthan");
    expect(screen.getByTestId("nearby-pin-credit")).toHaveTextContent(/India Post/);
  });

  /** Choosing a state or a division after it is a search by them: the PIN is left. */
  it("leaves the PIN code for a division chosen after it", async () => {
    signedInAs("CUSTOMER");
    mockNearby.places.mockResolvedValue([AJMER_PIN]);
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeEnabled());
    await searchPin("305001");
    await waitFor(() => expect(screen.getByTestId("nearby-near")).toBeTruthy());

    await chooseDivision("RJ-JAIPUR");
    await waitFor(() => expect(mockNearby.painters).toHaveBeenLastCalledWith({ state: "RJ", division: "RJ-JAIPUR" }));
    expect(screen.getByTestId("nearby-in")).toHaveTextContent("In Jaipur, Rajasthan");
    expect(screen.queryByTestId("nearby-near")).toBeNull();
    expect(screen.queryByTestId("nearby-pin-credit")).toBeNull();
    expect(screen.getByTestId("nearby-pin").props.value).toBe("");
  });

  it("says a PIN code has six digits, and looks nothing up", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/nearby" });
    await searchPin("3050");
    await waitFor(() => expect(screen.getByTestId("nearby-pin-problem")).toHaveTextContent(/A PIN code has six digits, like 305001\./));
    expect(mockNearby.places).not.toHaveBeenCalled();
    expect(mockNearby.painters).not.toHaveBeenCalled();
  });

  /** A PIN in another state isn't found: the server finds places in the open states alone. */
  it("says so when a PIN code isn't found in Rajasthan, and searches nothing", async () => {
    signedInAs("CUSTOMER");
    mockNearby.places.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeEnabled());
    await searchPin("380001");
    await waitFor(() =>
      expect(screen.getByTestId("nearby-pin-problem")).toHaveTextContent(
        /We couldn't find the PIN code 380001 in Rajasthan\. Check it — HueVistaa is only in Rajasthan for now\./,
      ),
    );
    expect(mockNearby.painters).not.toHaveBeenCalled();
  });

  /** A PIN typed on a Hindi keyboard is still a PIN; nobody near it yet is news on its way. */
  it("takes a PIN in Hindi digits, and says painters are coming soon near it", async () => {
    signedInAs("CUSTOMER");
    mockNearby.places.mockResolvedValue([AJMER_PIN]);
    mockNearby.painters.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeEnabled());
    await searchPin("३०५००१");
    expect(mockNearby.places).toHaveBeenCalledWith("305001");
    await waitFor(() => expect(screen.getByText("Painters in Ajmer are coming soon.")).toBeTruthy());
    expect(screen.getByTestId("nearby-or-all-of")).toHaveTextContent("Or choose “All of Rajasthan” to see everyone in the state.");
  });

  it("says so when the states can't be loaded, and asks again", async () => {
    signedInAs("CUSTOMER");
    mockNearby.workAreas.mockRejectedValue(new ApiError("http", 500, "down"));
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-state")).toBeTruthy());
    // The list is tried again a few times before it counts as failed.
    for (let i = 0; i < 4; i++) await tick(10_000);
    await waitFor(() => expect(screen.getByText("Couldn't load the list of states.")).toBeTruthy());
    expect(screen.getByTestId("nearby-state")).toBeDisabled();

    mockNearby.workAreas.mockResolvedValue(WORK_AREAS);
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(screen.queryByText("Couldn't load the list of states.")).toBeNull());
    await chooseState("RJ");
    await waitFor(() => expect(mockNearby.painters).toHaveBeenCalledWith({ state: "RJ" }));
  });
});

// ── C26 · D1 · Reviewing the job ──────────────────────────────────────────────

describe("D1 · A board's QR", () => {
  it("asks someone signed out to sign in, and comes back to the board after", async () => {
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByText("Sign in to collect points or review the job")).toBeTruthy());
    fireEvent.press(screen.getByTestId("board-link-go"));
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(peekRememberedRoute()).toBe(`/r/${BOARD}`);
  });

  it("sends a painter to claim their points", async () => {
    signedInAs("PAINTER");
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen).toHavePathname(`/painter/claim/${BOARD}`));
  });

  it("sends a shop to the website to collect its half", async () => {
    signedInAs("RETAILER");
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByText("Shops collect their half on the website")).toBeTruthy());
    fireEvent.press(screen.getByTestId("board-link-web"));
    expect(mockBrowser.openBrowserAsync).toHaveBeenCalledWith(expect.stringContaining(`/r/${BOARD}`), expect.anything());
  });

  it("lets the customer review the job, checked as the server checks it", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardReview.mockResolvedValue(boardState());
    mockCommunity.submitReview.mockResolvedValue(boardState({ canReview: false, canEdit: true, review: { rating: 4, body: "Colours matched the board.", displayName: "Priya S.", status: "PENDING", createdAt: ist(0) } }));
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByText("How did it go?")).toBeTruthy());
    expect(screen.getByText(/You chose your colours with Sharma Paints\./)).toBeTruthy();
    expect(screen.getByTestId("review-name").props.value).toBe("Priya S.");
    expect(screen.getByTestId("star-5")).toHaveTextContent("☆");
    // Nothing that would be refused is sent: every attempt counts per network.
    fireEvent.changeText(screen.getByTestId("review-body"), "a    b    c");
    fireEvent.press(screen.getByTestId("review-send"));
    await waitFor(() => expect(screen.getByText("Tap a star to give your rating.")).toBeTruthy());
    expect(screen.getByText("Tell us a little more — at least 10 characters.")).toBeTruthy();
    expect(mockCommunity.submitReview).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("star-4"));
    fireEvent.changeText(screen.getByTestId("review-body"), "  Colours matched the board.  ");
    fireEvent.press(screen.getByTestId("review-send"));
    await waitFor(() => expect(screen.getByText("Thank you for your review.")).toBeTruthy());
    expect(mockCommunity.submitReview).toHaveBeenCalledWith(BOARD, { rating: 4, body: "Colours matched the board.", displayName: "Priya S." });
    expect(screen.getByTestId("review-status")).toHaveTextContent(/once we've read it/);
    expect(screen.getByTestId("review-change")).toBeTruthy();
  });

  it("after an answer that never came, finds the review there and says thank you", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardReview.mockResolvedValueOnce(boardState());
    mockCommunity.submitReview.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByTestId("review-send")).toBeTruthy());
    fireEvent.press(screen.getByTestId("star-5"));
    fireEvent.changeText(screen.getByTestId("review-body"), "Lovely finish, thank you.");
    mockCommunity.boardReview.mockResolvedValue(boardState({ canReview: false, canEdit: true, review: { rating: 5, body: "Lovely finish, thank you.", displayName: "Priya S.", status: "PENDING", createdAt: ist(0) } }));
    fireEvent.press(screen.getByTestId("review-send"));
    await waitFor(() => expect(screen.getByText("Thank you for your review.")).toBeTruthy());
    expect(screen.queryByTestId("review-error")).toBeNull();
    expect(mockCommunity.submitReview).toHaveBeenCalledTimes(1);
  });

  it("says why when it isn't this customer's to review, and offers the painter's way in", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardReview.mockResolvedValue(boardState({ canReview: false, reason: "Only the person this room was made for can review it." }));
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByText("This one isn't yours to review.")).toBeTruthy());
    expect(screen.getByTestId("review-status")).toHaveTextContent("Only the person this room was made for can review it.");
    // A painter signed in here as a homeowner: the same board, in the painter web app.
    fireEvent.press(screen.getByText("I'm the painter: open in the painter app"));
    expect(mockBrowser.openBrowserAsync).toHaveBeenCalledWith(`https://painter.huevistaa.com/r/${BOARD}`, expect.anything());
  });

  it("never offers the painter's way in to the room's owner", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardReview.mockResolvedValue(boardState({ canReview: false, canEdit: true, review: { rating: 5, body: "Lovely finish, thank you.", displayName: "Priya S.", status: "PENDING", createdAt: ist(0) } }));
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByText("Thank you for your review.")).toBeTruthy());
    expect(screen.queryByTestId("review-painter-door")).toBeNull();
  });

  it("warns that changing a published review takes it off the page until it's read", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardReview.mockResolvedValue(boardState({ canReview: false, canEdit: true, review: { rating: 5, body: "Lovely finish, thank you.", displayName: "Priya S.", status: "PUBLISHED", createdAt: ist(-DAY) } }));
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByText("It's on the Community page now.")).toBeTruthy());
    fireEvent.press(screen.getByTestId("review-change"));
    await waitFor(() => expect(screen.getByText("Change your review.")).toBeTruthy());
    expect(screen.getByText(/until then, your review is taken off the page/)).toBeTruthy();
    expect(screen.getByTestId("review-body").props.value).toBe("Lovely finish, thank you.");
  });
});

describe("C26 · Review the job", () => {
  it("opens the room's board for review", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardForProject.mockResolvedValue({ token: BOARD });
    mockCommunity.boardReview.mockResolvedValue(boardState());
    renderRouter("./app", { initialUrl: "/review/p1" });
    await waitFor(() => expect(screen.getByText("How did it go?")).toBeTruthy());
    expect(mockCommunity.boardReview).toHaveBeenCalledWith(BOARD);
  });

  it("says when the room has no board yet, in the server's words", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardForProject.mockRejectedValue(new ApiError("http", 404, "This room doesn't have a colour board yet. Make one in the studio, then you can review the job."));
    renderRouter("./app", { initialUrl: "/review/p1" });
    await waitFor(() => expect(screen.getByText(/doesn't have a colour board yet/)).toBeTruthy());
  });

  // The server's own sentence names the room's id; the app says it plainly.
  it("says a room that isn't the account's any more in its own words", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardForProject.mockRejectedValue(new ApiError("http", 404, "Project not found: 9f1c2d"));
    renderRouter("./app", { initialUrl: "/review/9f1c2d" });
    await waitFor(() => expect(screen.getByText("This room isn't on your account any more.")).toBeTruthy());
    expect(screen.queryByText(/9f1c2d/)).toBeNull();
  });
});

// ── S6 · S7 · Help and support ────────────────────────────────────────────────

describe("S6 · Help and support", () => {
  const summary = (id: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
    id,
    channel: "IN_APP",
    status: "OPEN",
    subject: "Where is my board?",
    lastMessage: "It's in Boards.",
    updatedAt: ist(-DAY),
    ...extra,
  });

  it("offers the chat still going, lists the past ones, and opens a new one with its answer", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversations.mockResolvedValue([summary("c1", { status: "NEEDS_HUMAN" }), summary("c0", { status: "RESOLVED", subject: "Old question" })]);
    mockSupport.start.mockResolvedValue(chat("c2"));
    mockSupport.conversation.mockImplementation(mockNever);
    renderRouter("./app", { initialUrl: "/help" });
    await waitFor(() => expect(screen.getByTestId("help-ongoing")).toBeTruthy());
    expect(screen.getByText("Waiting for our team")).toBeTruthy();
    expect(screen.getByText("Resolved")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("help-message"), "  My payment didn't go through  ");
    fireEvent.press(screen.getByTestId("help-ask"));
    await waitFor(() => expect(screen).toHavePathname("/help/c2"));
    expect(mockSupport.start).toHaveBeenCalledWith("My payment didn't go through");
    // Opened with the assistant's answer that came back with the start, before any read answers.
    expect(screen.getByText("Sorry about that — what's the payment reference?")).toBeTruthy();
  });

  it("comes with the message already written when another screen sent it", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversations.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/help?draft=My%20payment%20didn't%20go%20through.%20Payment%20reference%3A%20pay_9." });
    await waitFor(() => expect(screen.getByTestId("help-message").props.value).toBe("My payment didn't go through. Payment reference: pay_9."));
  });

  // A start is a paid answer: one with no answer is looked for, never sent twice.
  it("after a start with no answer, finds the chat it made", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversations.mockResolvedValueOnce([]);
    mockSupport.start.mockRejectedValue(new ApiError("timeout", 0, "timeout"));
    renderRouter("./app", { initialUrl: "/help" });
    await waitFor(() => expect(screen.getByTestId("help-message")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("help-message"), "Where is my board?");
    mockSupport.conversations.mockResolvedValue([summary("c9", { updatedAt: ist(0) })]);
    mockSupport.conversation.mockResolvedValue(chat("c9", { subject: "Where is my board?" }));
    fireEvent.press(screen.getByTestId("help-ask"));
    await waitFor(() => expect(screen).toHavePathname("/help/c9"));
    expect(mockSupport.start).toHaveBeenCalledTimes(1);
  });
});

// The server answers inside the transaction that saves the start: until the answer is in,
// the chat can't be seen. One look straight after a dropped connection proves nothing.
describe("S6 · A start whose answer was lost", () => {
  const summary = (id: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
    id,
    channel: "IN_APP",
    status: "OPEN",
    subject: "Where is my board?",
    lastMessage: "It's in Boards.",
    updatedAt: ist(0),
    ...extra,
  });

  it("keeps looking while it may still be answered, and opens it when it shows", async () => {
    signedInAs("CUSTOMER");
    // An earlier chat with the same words isn't this one.
    mockSupport.conversations.mockResolvedValue([summary("earlier", { updatedAt: ist(-60_000) })]);
    mockSupport.start.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/help" });
    await waitFor(() => expect(screen.getByTestId("help-ongoing")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("help-message"), "Where is my board?");
    fireEvent.press(screen.getByTestId("help-ask"));
    await waitFor(() => expect(screen.getByTestId("help-checking")).toBeTruthy());
    await tick(5_000);
    expect(screen).toHavePathname("/help");
    mockSupport.conversations.mockResolvedValue([summary("c9"), summary("earlier", { updatedAt: ist(-60_000) })]);
    mockSupport.conversation.mockResolvedValue(chat("c9", { subject: "Where is my board?" }));
    await tick(5_000);
    await waitFor(() => expect(screen).toHavePathname("/help/c9"));
    expect(mockSupport.start).toHaveBeenCalledTimes(1);
  });

  it("says it didn't get through only once it can't land any more", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversations.mockResolvedValue([]);
    mockSupport.start.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/help" });
    await waitFor(() => expect(screen.getByTestId("help-message")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("help-message"), "Where is my board?");
    fireEvent.press(screen.getByTestId("help-ask"));
    await waitFor(() => expect(screen.getByTestId("help-checking")).toBeTruthy());
    await tick(60_000);
    expect(screen.queryByTestId("help-error")).toBeNull();
    for (let i = 0; i < 20; i++) await tick(5_000);
    await waitFor(() => expect(screen.getByTestId("help-error")).toHaveTextContent(/didn't get through/));
    expect(screen.getByTestId("help-message").props.value).toBe("Where is my board?");
    expect(mockSupport.start).toHaveBeenCalledTimes(1);
  });
});

describe("S7 · Support conversation", () => {
  it("sends a message and shows the answer; asks for a person", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("c1"));
    mockSupport.send.mockResolvedValue(
      chat("c1", {
        messages: [...chat("c1").messages, { id: "m3", sender: "USER", body: "pay_9", createdAt: ist(0) }, { id: "m4", sender: "AI", body: "Thanks — that one is refunded.", createdAt: ist(0) }],
      }),
    );
    mockSupport.requestHuman.mockResolvedValue(
      chat("c1", { status: "NEEDS_HUMAN", messages: [...chat("c1").messages, { id: "m5", sender: "SYSTEM", body: "Connecting you with a team member — they'll reply here soon.", createdAt: ist(0) }] }),
    );
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByText("Sorry about that — what's the payment reference?")).toBeTruthy());
    expect(screen.getByTestId("chat-status")).toHaveTextContent("Our assistant replies straight away");
    fireEvent.changeText(screen.getByTestId("chat-input"), "pay_9");
    fireEvent.press(screen.getByTestId("chat-send"));
    await waitFor(() => expect(screen.getByText("Thanks — that one is refunded.")).toBeTruthy());
    expect(mockSupport.send).toHaveBeenCalledWith("c1", "pay_9");
    fireEvent.press(screen.getByTestId("chat-person"));
    await waitFor(() => expect(screen.getByTestId("chat-status")).toHaveTextContent("A team member will reply here"));
    expect(screen.getByText("Connecting you with a team member — they'll reply here soon.")).toBeTruthy();
    expect(screen.queryByTestId("chat-person")).toBeNull();
  });

  it("reads an open chat again every 5 seconds while it's showing, and reads a reply out", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("c1"));
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-messages")).toBeTruthy());
    const before = mockSupport.conversation.mock.calls.length;
    mockSupport.conversation.mockResolvedValue(
      chat("c1", { status: "NEEDS_HUMAN", messages: [...chat("c1").messages, { id: "m9", sender: "AGENT", body: "Hi, Anil from the team here.", createdAt: ist(0) }] }),
    );
    await tick(5_100);
    await waitFor(() => expect(screen.getByText("Hi, Anil from the team here.")).toBeTruthy());
    expect(mockSupport.conversation.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getByText("Our team")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Our team: Hi, Anil from the team here.");
    // What was there when it opened isn't read out again.
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining("what's the payment reference"));
    announce.mockRestore();
  });

  // A link opened from a chat app lands on top of it; it isn't read under there.
  it("stops reading the chat while another screen covers it", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("c1"));
    mockCommunity.questions.mockResolvedValue({ items: [], total: 0, page: 0, size: 20, hasMore: false });
    mockCommunity.myQuestions.mockResolvedValue({ suggestedName: "Priya S.", questions: [] });
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-messages")).toBeTruthy());
    act(() => router.push("/questions"));
    await waitFor(() => expect(screen).toHavePathname("/questions"));
    await tick(100);
    const covered = mockSupport.conversation.mock.calls.length;
    for (let i = 0; i < 4; i++) await tick(5_000);
    expect(mockSupport.conversation.mock.calls.length).toBe(covered);
    act(() => router.back());
    await waitFor(() => expect(screen).toHavePathname("/help/c1"));
    for (let i = 0; i < 2; i++) await tick(5_000);
    expect(mockSupport.conversation.mock.calls.length).toBeGreaterThan(covered);
  });

  // The server's own note says a closed chat is followed by a new one.
  it("starts a new chat when writing under a closed one", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("c1", { status: "RESOLVED" }));
    mockSupport.start.mockResolvedValue(chat("c2", { subject: "Another thing" }));
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-status")).toHaveTextContent(/This chat is closed/));
    expect(screen.queryByTestId("chat-person")).toBeNull();
    fireEvent.changeText(screen.getByTestId("chat-input"), "Another thing");
    fireEvent.press(screen.getByTestId("chat-send"));
    await waitFor(() => expect(screen).toHavePathname("/help/c2"));
    expect(mockSupport.send).not.toHaveBeenCalled();
  });

  it("after a send with no answer, finds it once it's been answered", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("c1"));
    mockSupport.send.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("chat-input"), "pay_9");
    fireEvent.press(screen.getByTestId("chat-send"));
    await waitFor(() => expect(screen.getByTestId("chat-checking")).toBeTruthy());
    expect(screen.getByText("Sending…")).toBeTruthy();
    await tick(5_000);
    mockSupport.conversation.mockResolvedValue(
      chat("c1", { messages: [...chat("c1").messages, { id: "m3", sender: "USER", body: "pay_9", createdAt: ist(0) }, { id: "m4", sender: "AI", body: "Thanks — that one is refunded.", createdAt: ist(0) }] }),
    );
    await tick(5_000);
    await waitFor(() => expect(screen.getByText("Thanks — that one is refunded.")).toBeTruthy());
    expect(screen.queryByTestId("chat-error")).toBeNull();
    expect(screen.getByTestId("chat-input").props.value).toBe("");
    expect(mockSupport.send).toHaveBeenCalledTimes(1);
  });

  it("after a send with no answer that never arrived, keeps the message to send again", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("c1"));
    mockSupport.send.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("chat-input"), "pay_9");
    fireEvent.press(screen.getByTestId("chat-send"));
    await waitFor(() => expect(screen.getByTestId("chat-checking")).toBeTruthy());
    for (let i = 0; i < 30; i++) await tick(5_000);
    await waitFor(() => expect(screen.getByTestId("chat-error")).toHaveTextContent(/didn't get through/));
    expect(screen.getByTestId("chat-input").props.value).toBe("pay_9");
    expect(mockSupport.send).toHaveBeenCalledTimes(1);
  });

  it("says so when the conversation isn't on this account", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockRejectedValue(new ApiError("http", 404, "Conversation not found"));
    renderRouter("./app", { initialUrl: "/help/zzz" });
    await waitFor(() => expect(screen.getByText("This conversation isn't on your account.")).toBeTruthy());
  });
});

// ── S8 · Questions and answers ────────────────────────────────────────────────

describe("S8 · Questions and answers", () => {
  const page = (n: number, hasMore = false): QuestionPage => ({
    items: [{ id: `q${n}`, displayName: "Anil", question: `Can I paint outside? (${n})`, answer: "Yes — choose an exterior finish.", askedAt: "2026-05-02T10:00:00", answeredAt: "2026-05-03T10:00:00" }],
    total: 2,
    page: n,
    size: 20,
    hasMore,
  });

  it("lists answered questions, your own with where each stands, and takes a new one", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.questions.mockResolvedValue(page(0));
    mockCommunity.myQuestions.mockResolvedValue({
      suggestedName: "Priya S.",
      questions: [
        { id: "m1", displayName: "Priya S.", question: "Does the shade card match?", answer: "Taken down", status: "REJECTED", askedAt: ist(-DAY), answeredAt: null },
        { id: "m2", displayName: "Priya S.", question: "How long is a room open?", answer: "A year.", status: "PUBLISHED", askedAt: ist(-DAY), answeredAt: ist(0) },
      ],
    });
    mockCommunity.ask.mockImplementation(async (body, name) => ({ id: "m3", displayName: name, question: body, answer: null, status: "PENDING", askedAt: ist(0), answeredAt: null }));
    renderRouter("./app", { initialUrl: "/questions" });
    await waitFor(() => expect(screen.getByText("Can I paint outside? (0)")).toBeTruthy());
    expect(screen.getByText("2 answered questions")).toBeTruthy();
    expect(screen.getByText("Anil · May 2026")).toBeTruthy();
    expect(screen.getByText("Not published")).toBeTruthy();
    // A taken-down question's old answer isn't shown; a published one's is.
    expect(screen.queryByText("Taken down")).toBeNull();
    expect(screen.getByText("A year.")).toBeTruthy();

    fireEvent.press(screen.getByTestId("questions-open"));
    expect(screen.getByTestId("questions-name").props.value).toBe("Priya S.");
    fireEvent.changeText(screen.getByTestId("questions-body"), "too   short");
    fireEvent.press(screen.getByTestId("questions-send"));
    await waitFor(() => expect(screen.getByText("Your question needs at least 10 characters.")).toBeTruthy());
    expect(mockCommunity.ask).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId("questions-body"), " Can I use it on a ceiling? ");
    fireEvent.press(screen.getByTestId("questions-send"));
    await waitFor(() => expect(screen.getByText("Waiting for an answer")).toBeTruthy());
    expect(mockCommunity.ask).toHaveBeenCalledWith("Can I use it on a ceiling?", "Priya S.");
    expect(screen.getByText("Can I use it on a ceiling?")).toBeTruthy();
  });

  it("after an ask with no answer, finds it among your questions", async () => {
    signedInAs("PAINTER");
    mockCommunity.questions.mockResolvedValue(page(0));
    mockCommunity.myQuestions.mockResolvedValueOnce({ suggestedName: "Ravi K.", questions: [] });
    mockCommunity.ask.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/questions" });
    await waitFor(() => expect(screen.getByTestId("questions-open")).toBeTruthy());
    fireEvent.press(screen.getByTestId("questions-open"));
    await waitFor(() => expect(screen.getByTestId("questions-name").props.value).toBe("Ravi K."));
    fireEvent.changeText(screen.getByTestId("questions-body"), "Do points   expire?");
    mockCommunity.myQuestions.mockResolvedValue({
      suggestedName: "Ravi K.",
      questions: [{ id: "x", displayName: "Ravi K.", question: "Do points expire?", answer: null, status: "PENDING", askedAt: ist(0), answeredAt: null }],
    });
    fireEvent.press(screen.getByTestId("questions-send"));
    await waitFor(() => expect(screen.getByText("Waiting for an answer")).toBeTruthy());
    expect(screen.queryByTestId("questions-error")).toBeNull();
    expect(mockCommunity.ask).toHaveBeenCalledTimes(1);
  });
});

describe("S8 · A question whose answer was lost", () => {
  // The same words already waiting are an earlier ask, not this one.
  it("doesn't take an earlier question with the same words for this one", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.questions.mockResolvedValue({ items: [], total: 0, page: 0, size: 20, hasMore: false });
    const waiting: OwnQuestion = { id: "w1", displayName: "Priya S.", question: "Do points expire?", answer: null, status: "PENDING", askedAt: ist(-DAY), answeredAt: null };
    mockCommunity.myQuestions.mockResolvedValue({ suggestedName: "Priya S.", questions: [waiting] });
    mockCommunity.ask.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/questions" });
    await waitFor(() => expect(screen.getByText("Waiting for an answer")).toBeTruthy());
    fireEvent.press(screen.getByTestId("questions-open"));
    fireEvent.changeText(screen.getByTestId("questions-body"), "Do points expire?");
    fireEvent.press(screen.getByTestId("questions-send"));
    await waitFor(() => expect(screen.getByTestId("questions-error")).toBeTruthy());
    expect(screen.getByTestId("questions-body").props.value).toBe("Do points expire?");
  });
});

// ── D2 · A shared room ────────────────────────────────────────────────────────

describe("D2 · A shared room", () => {
  it("shows the room to anyone, and brings someone signed out back to save it", async () => {
    mockShare.room.mockResolvedValue(sharedRoom());
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByTestId("shared-room")).toBeTruthy());
    expect(screen.getByText("Sunita's living room")).toBeTruthy();
    expect(screen.getByText("HV0348")).toBeTruthy();
    expect(screen.getByText("Original colour")).toBeTruthy();
    fireEvent.press(screen.getByTestId("shared-sign-in"));
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(peekRememberedRoute()).toBe(`/share/${SHARE}`);
    expect(mockShare.claim).not.toHaveBeenCalled();
  });

  it("tells a stopped link from a server that didn't answer", async () => {
    mockShare.room.mockRejectedValue(new ApiError("http", 404, "Share link not found or expired."));
    const first = renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByText("This link has stopped working.")).toBeTruthy());
    first.unmount();
    queryClient.clear();
    mockShare.room.mockRejectedValue(new ApiError("http", 503, "busy"));
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    for (let i = 0; i < 6; i++) await tick(10_000);
    await waitFor(() => expect(screen.getByText("We couldn't open this room.")).toBeTruthy());
  });

  it("repaints a wall from the link's own colours, and puts the shared ones back", async () => {
    mockShare.room.mockResolvedValue(sharedRoom());
    mockShare.brands.mockResolvedValue([{ name: "Asian Paints", slug: "asian-paints", shadeCount: 2 }]);
    mockShare.shades.mockResolvedValue([
      { shadeCode: "HV0101", hvCode: "HV0101", hexCode: "#e8d8b8", shadeFamily: "Off Whites", brandName: "Asian Paints", brandSlug: "asian-paints", lrv: 80 },
      { shadeCode: "HV0202", hvCode: "HV0202", hexCode: "#3b5b7a", shadeFamily: "Blues", brandName: "Asian Paints", brandSlug: "asian-paints", lrv: 20 },
    ]);
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByTestId("shared-choose")).toBeTruthy());
    fireEvent.press(screen.getByTestId("wall-12"));
    fireEvent.press(screen.getByTestId("shared-choose"));
    await waitFor(() => expect(screen.getByTestId("palette-grid")).toBeTruthy());
    expect(mockShare.shades).toHaveBeenCalledWith(SHARE, "asian-paints");
    fireEvent.changeText(screen.getByTestId("palette-search"), "HV0202");
    await waitFor(() => expect(screen.queryByLabelText("HV0101")).toBeNull());
    fireEvent.press(screen.getByLabelText("HV0202"));
    await waitFor(() => expect(screen.getByText("HV0202")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shared-reset"));
    expect(screen.queryByText("HV0202")).toBeNull();
  });

  it("copies it into a customer's rooms after a confirm, and opens it there", async () => {
    signedInAs("CUSTOMER");
    mockShare.room.mockResolvedValue(sharedRoom());
    mockProjects.get.mockRejectedValue(new ApiError("http", 404, "Project not found: owner-room"));
    mockShare.claim.mockResolvedValue({ id: "my-copy" });
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByTestId("shared-save")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shared-save"));
    await waitFor(() => expect(screen.getByText("Copy this room to your rooms?")).toBeTruthy());
    expect(mockShare.claim).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("shared-confirm-confirm"));
    await waitFor(() => expect(screen).toHavePathname("/room/my-copy/paint"));
    expect(mockShare.claim).toHaveBeenCalledTimes(1);
  });

  it("sends its owner to their own room instead", async () => {
    signedInAs("CUSTOMER");
    mockShare.room.mockResolvedValue(sharedRoom());
    mockProjects.get.mockResolvedValue({ id: "owner-room" });
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByTestId("shared-open-mine")).toBeTruthy());
    expect(screen.queryByTestId("shared-save")).toBeNull();
  });

  it("says when there's no room left, and where to get one", async () => {
    signedInAs("CUSTOMER");
    mockShare.room.mockResolvedValue(sharedRoom());
    mockProjects.get.mockRejectedValue(new ApiError("http", 404, "Project not found: owner-room"));
    mockShare.claim.mockRejectedValue(new ApiError("http", 402, "Buy a room for ₹99 to start this one — it stays open for 30 days."));
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByTestId("shared-save")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shared-save"));
    await waitFor(() => expect(screen.getByTestId("shared-confirm-confirm")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shared-confirm-confirm"));
    await waitFor(() => expect(screen.getAllByText(/Buy a room for ₹99/).length).toBeGreaterThan(0));
    fireEvent.press(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.getByText("Rooms and credits")).toBeTruthy());
  });

  // A copy spends a room and has no key: an unanswered one is never sent again.
  it("after a copy with no answer, points to the rooms instead of copying again", async () => {
    signedInAs("CUSTOMER");
    mockShare.room.mockResolvedValue(sharedRoom());
    mockProjects.get.mockRejectedValue(new ApiError("http", 404, "Project not found: owner-room"));
    mockShare.claim.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByTestId("shared-save")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shared-save"));
    await waitFor(() => expect(screen.getByTestId("shared-confirm-confirm")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shared-confirm-confirm"));
    await waitFor(() => expect(screen.getByTestId("shared-save-error")).toHaveTextContent(/Look in your rooms before trying again/));
    expect(screen.queryByTestId("shared-save")).toBeNull();
    expect(mockShare.claim).toHaveBeenCalledTimes(1);
  });

  it("offers no copy to a painter", async () => {
    signedInAs("PAINTER");
    mockShare.room.mockResolvedValue(sharedRoom());
    renderRouter("./app", { initialUrl: `/share/${SHARE}` });
    await waitFor(() => expect(screen.getByTestId("shared-room")).toBeTruthy());
    expect(screen.queryByTestId("shared-save")).toBeNull();
    expect(mockProjects.get).not.toHaveBeenCalled();
  });
});

