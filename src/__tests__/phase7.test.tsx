/**
 * Phase 7 through the REAL route tree: painters and shops near you (C32), reviewing the
 * job (C26, D1), help and support (S6, S7), questions and answers (S8) and a shared room
 * (D2). Only the network, the secure store, the phone's location, the dialler and the
 * browser are faked (and the GPU, as everywhere in Jest).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Linking } from "react-native";

import { ApiError } from "@/api/errors";
import type { BoardReviewState, MyQuestions, OwnQuestion, QuestionPage } from "@/api/endpoints/community";
import type { NearbyPainter, NearbyShop } from "@/api/endpoints/nearby";
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
const mockNearby = { painters: jest.fn(), shops: jest.fn(), painterPhone: jest.fn() };
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
  about: "Interiors and textures.",
  serviceAreas: ["Belagavi"],
  specialties: ["Textures"],
  yearsExperience: 12,
  dayRateInr: 1500,
  rating: 4.6,
  ratingCount: 23,
  jobsCompleted: 3,
  distanceKm: 0.6,
  ...extra,
});
const shopRow = (extra: Partial<NearbyShop> = {}): NearbyShop => ({
  id: "s1",
  name: "Sharma Paints",
  addressLine: "Shop 4, Khade Bazar",
  city: "Belagavi",
  state: "Karnataka",
  phone: "0831 240 1234",
  openingHours: "9 am – 9 pm",
  latitude: 15.852,
  longitude: 74.5,
  distanceKm: 2.4,
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

// ── C32 · Painters and shops near you ─────────────────────────────────────────

describe("C32 · Painters and shops near you", () => {
  const here = () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLocation.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 15.852347, longitude: 74.504981, accuracy: 30 } });
  };

  it("asks for the location only on a press, then lists who is near, nearest first", async () => {
    signedInAs("CUSTOMER");
    here();
    mockNearby.painters.mockResolvedValue([painterRow("p1"), painterRow("p2", { name: null, jobsCompleted: 0, rating: null, ratingCount: 0, distanceKm: 12.3 })]);
    mockNearby.shops.mockResolvedValue([shopRow()]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-ask")).toBeTruthy());
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("nearby-painters")).toBeTruthy());
    // Rounded to ~100 m before it leaves the phone.
    expect(mockNearby.painters).toHaveBeenCalledWith({ lat: 15.852, lon: 74.505, radiusKm: 10 });
    expect(screen.getByText("Under 1 km away")).toBeTruthy();
    expect(screen.getByText("3 jobs done on HueVistaa · ★ 4.6 from 23 reviews")).toBeTruthy();
    expect(screen.getByText("New on HueVistaa — no jobs or reviews yet")).toBeTruthy();
    expect(screen.getByText("Painters · 2")).toBeTruthy();
    fireEvent.press(screen.getByText("Shops · 1"));
    expect(screen.getByText("Shop 4, Khade Bazar · Belagavi, Karnataka")).toBeTruthy();
    expect(screen.getByText("Open 9 am – 9 pm")).toBeTruthy();
    fireEvent.press(screen.getByTestId("directions-s1"));
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining("15.852,74.5"));
  });

  it("searches at once for someone who already allowed it, and opens on Shops when asked", async () => {
    signedInAs("CUSTOMER");
    here();
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockNearby.painters.mockResolvedValue([]);
    mockNearby.shops.mockResolvedValue([shopRow()]);
    renderRouter("./app", { initialUrl: "/nearby?tab=shops" });
    await waitFor(() => expect(screen.getByTestId("nearby-shops")).toBeTruthy());
  });

  // Each number asked for counts against 20 a day — never asked twice.
  it("asks for a painter's number only on Call, dials it, and keeps it", async () => {
    signedInAs("CUSTOMER");
    here();
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    mockNearby.shops.mockResolvedValue([]);
    mockNearby.painterPhone.mockResolvedValue({ id: "p1", phone: "+919845012345" });
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("call-p1")).toBeTruthy());
    expect(mockNearby.painterPhone).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("call-p1"));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith("tel:+919845012345"));
    expect(screen.getByTestId("whatsapp-p1")).toBeTruthy();
    fireEvent.press(screen.getByTestId("call-p1"));
    await tick();
    expect(mockNearby.painterPhone).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledTimes(2);
  });

  it("says a painter can't be reached in the server's words", async () => {
    signedInAs("CUSTOMER");
    here();
    mockNearby.painters.mockResolvedValue([painterRow("p1")]);
    mockNearby.shops.mockResolvedValue([]);
    mockNearby.painterPhone.mockRejectedValue(new ApiError("http", 404, "This painter isn't taking customers through HueVistaa just now."));
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("call-p1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("call-p1"));
    await waitFor(() => expect(screen.getByTestId("call-error-p1")).toHaveTextContent(/isn't taking customers/));
    expect(openURL).not.toHaveBeenCalled();
  });

  it("offers Settings when location was refused for good", async () => {
    signedInAs("CUSTOMER");
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("nearby-problem")).toHaveTextContent(/Turn it on in Settings/));
    fireEvent.press(screen.getByText("Open settings"));
    expect(openSettings).toHaveBeenCalled();
    expect(mockNearby.painters).not.toHaveBeenCalled();
  });

  it("searches further from an empty list", async () => {
    signedInAs("CUSTOMER");
    here();
    mockNearby.painters.mockResolvedValue([]);
    mockNearby.shops.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByText("No painters listed within 10 km yet.")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-further"));
    await waitFor(() => expect(mockNearby.painters).toHaveBeenCalledWith({ lat: 15.852, lon: 74.505, radiusKm: 25 }));
  });

  // The allowance is small and shared: a refusal is said, never tried again by itself.
  it("shows a refusal in the server's words and doesn't ask again", async () => {
    signedInAs("CUSTOMER");
    here();
    mockNearby.painters.mockRejectedValue(new ApiError("http", 429, "Too many of these from your account. Please wait a while and try again."));
    mockNearby.shops.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByText(/Too many of these from your account/)).toBeTruthy());
    for (let i = 0; i < 4; i++) await tick(10_000);
    expect(mockNearby.painters).toHaveBeenCalledTimes(1);
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

  it("says why when it isn't this customer's to review", async () => {
    signedInAs("CUSTOMER");
    mockCommunity.boardReview.mockResolvedValue(boardState({ canReview: false, reason: "Only the person this room was made for can review it." }));
    renderRouter("./app", { initialUrl: `/r/${BOARD}` });
    await waitFor(() => expect(screen.getByText("This one isn't yours to review.")).toBeTruthy());
    expect(screen.getByTestId("review-status")).toHaveTextContent("Only the person this room was made for can review it.");
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

  it("reads an open chat again every 5 seconds while it's showing", async () => {
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

  it("after a send with no answer that didn't arrive, keeps the message to send again", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("c1"));
    mockSupport.send.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("chat-input"), "pay_9");
    fireEvent.press(screen.getByTestId("chat-send"));
    await waitFor(() => expect(screen.getByTestId("chat-error")).toHaveTextContent(/isn't there yet/));
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

