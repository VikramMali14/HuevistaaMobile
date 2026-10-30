/**
 * Phase 6 through the REAL route tree: the painter's app (P1–P12) and becoming a painter
 * (C33). Only the network, the secure store, the camera, the phone's location and files,
 * and the board reader's WebView are faked — the reader itself is proved in Chromium
 * (scripts/verify-board-reader.mjs) and its conversation in board-reader-protocol.test.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { AppState } from "react-native";

import * as WebBrowser from "expo-web-browser";

import { ApiError } from "@/api/errors";
import type { NearbyPlace, WorkAreas } from "@/api/endpoints/nearby";
import type { PainterProfile } from "@/api/endpoints/painter";
import type { PainterWallet, Redemption, RewardItem, RewardScan } from "@/api/endpoints/rewards";
import { queryClient } from "@/api/query-client";
import type { UserProfile } from "@/api/types";
import { forgetRememberedRoute } from "@/auth/pending-route";
import * as env from "@/config/env";
import type { BoardReaderProps } from "@/features/painter/board-reader/protocol";
import { holdSharedBoard, takeSharedBoard } from "@/features/painter/shared-board";

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

// The camera: its permission, and a view the test can hand a QR's text to. The permission
// is read on mount and again when the screen asks, as expo-camera's own hook does.
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = { granted: true, canAskAgain: true };
const mockRequestPermission = jest.fn(async () => mockPermission);
jest.mock("expo-camera", () => {
  // jest.mock factories run before imports are set up, so they load their own.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useCallback, useState } = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    CameraView: (props: object) => <View {...props} />,
    useCameraPermissions: () => {
      const [permission, setPermission] = useState(mockPermission);
      const get = useCallback(async () => {
        setPermission(mockPermission);
        return mockPermission;
      }, []);
      return [permission, mockRequestPermission, get];
    },
  };
});

const mockLocation = {
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getLastKnownPositionAsync: jest.fn(async (_options?: { maxAge?: number }): Promise<{ coords: { latitude: number; longitude: number; accuracy: number } } | null> => null),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
};
jest.mock("expo-location", () => mockLocation);

// The phone's files: the picker, and reading what it picked.
const mockPicker = { getDocumentAsync: jest.fn() };
jest.mock("expo-document-picker", () => mockPicker);
const mockReadFile = {
  statFile: jest.fn((_uri: string) => ({ name: "board.pdf", mime: "application/pdf", size: 70_000 as number | null })),
  readFileBase64: jest.fn(async (_uri: string) => "JVBERi0xLjQK"),
};
jest.mock("@/features/painter/read-file", () => ({
  get statFile() {
    return mockReadFile.statFile;
  },
  get readFileBase64() {
    return mockReadFile.readFileBase64;
  },
}));

// The board reader: the test plays the page, through the props the screen gives it.
const mockReader: { props: BoardReaderProps | null; mounts: number } = { props: null, mounts: 0 };
jest.mock("@/features/painter/board-reader/BoardReader", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useEffect } = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    BoardReader: function BoardReader(props: BoardReaderProps) {
      mockReader.props = props;
      useEffect(() => {
        mockReader.mounts += 1;
        return () => {
          mockReader.props = null;
        };
      }, []);
      return <View testID="board-reader" />;
    },
  };
});

const mockAuth = {
  profile: jest.fn<Promise<UserProfile>, []>(),
  logout: jest.fn(async () => undefined),
  setCustomerProfile: jest.fn(),
  switchProfile: jest.fn(),
};
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));
const mockRewards = {
  wallet: jest.fn<Promise<PainterWallet>, []>(),
  catalogue: jest.fn<Promise<RewardItem[]>, []>(),
  redemptions: jest.fn<Promise<Redemption[]>, []>(),
  redeem: jest.fn<Promise<Redemption>, [string, string]>(),
  scan: jest.fn<Promise<RewardScan>, [string]>(),
  claim: jest.fn(),
};
jest.mock("@/api/endpoints/rewards", () => ({
  get rewardsApi() {
    return mockRewards;
  },
}));
const mockPainter = {
  becomePainter: jest.fn<Promise<PainterProfile>, []>(),
  profile: jest.fn<Promise<PainterProfile>, []>(),
  updateProfile: jest.fn(),
  updateListing: jest.fn(),
};
jest.mock("@/api/endpoints/painter", () => ({
  get painterApi() {
    return mockPainter;
  },
}));
const mockNearby = { places: jest.fn(), workAreas: jest.fn() };
jest.mock("@/api/endpoints/nearby", () => ({
  get nearbyApi() {
    return mockNearby;
  },
}));
const mockMe = { entitlement: jest.fn(), projects: jest.fn(), aiCredits: jest.fn(), assignedProducts: jest.fn(), renders: jest.fn() };
jest.mock("@/api/endpoints/me", () => ({ meApi: mockMe }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TOKEN = "0VkTlzUw5CGJ-bTtxixeiS0nVfg";
const DAY = 86_400_000;
/** A server time (India's wall clock, no zone) this far from now. */
const ist = (fromNow: number) => new Date(Date.now() + fromNow + 5.5 * 3600_000).toISOString().slice(0, 19);

function signedInAs(role: "PAINTER" | "CUSTOMER") {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Ravi Kumar", provider: "LOCAL", role, phoneNumber: "+919876543210" });
}

const wallet = (extra: Partial<PainterWallet> = {}): PainterWallet => ({
  balance: 1250,
  lifetimeEarned: 1500,
  canRedeem: true,
  validityDays: 365,
  expiryWarningDays: 10,
  nextExpiringPoints: 120,
  nextExpiryAt: ist(3 * DAY),
  pendingRedemptions: 1,
  lots: [
    { id: "l1", pointsRemaining: 120, expiresAt: ist(DAY) },
    { id: "l2", pointsRemaining: 1130, expiresAt: ist(200 * DAY) },
  ],
  recentActivity: [
    { id: "a1", points: 25, type: "PROJECT_QR_EARNED", label: "Board for the Sharma flat", createdAt: ist(-DAY) },
    { id: "a2", points: -300, type: "SPENT_ON_PAINTER_REWARD", label: "Brush set", createdAt: ist(-2 * DAY) },
  ],
  ...extra,
});
const reward = (code: string, extra: Partial<RewardItem> = {}): RewardItem => ({
  code,
  title: code === "BRUSH" ? "Brush set" : code,
  description: "Three brushes for cutting in.",
  category: "TOOLS",
  pointsCost: 300,
  stock: 40,
  inStock: true,
  affordable: true,
  pointsShort: 0,
  ...extra,
});
const painter = (extra: Partial<PainterProfile> = {}): PainterProfile => ({
  userId: "u1",
  name: "Ravi Kumar",
  phone: "+919876543210",
  phoneVerified: true,
  pendingPhone: null,
  serviceAreas: ["Thane"],
  specialties: ["Textures"],
  yearsExperience: 12,
  dayRateInr: 1500,
  rating: 4.6,
  ratingCount: 18,
  jobsCompleted: 40,
  listedForCustomers: true,
  about: "",
  latitude: 19.07,
  longitude: 72.88,
  locationUpdatedAt: ist(-10 * DAY),
  // Certified for most of a year: only HueVistaa Certified painters are shown to customers.
  certified: true,
  certifiedUntil: ist(200 * DAY),
  ...extra,
});
/** The places painters choose from, as the server names them — cut down to these tests'. */
const WORK_AREAS: WorkAreas = {
  anywhere: "IN",
  states: [
    {
      code: "RJ",
      name: "Rajasthan",
      nameHi: "राजस्थान",
      divisions: ["Ajmer", "Bharatpur", "Bikaner", "Jaipur", "Jodhpur", "Kota", "Udaipur"].map((name) => ({
        code: `RJ-${name.toUpperCase()}`,
        name,
        nameHi: name,
        hint: null,
        hintHi: null,
      })),
    },
    {
      code: "GJ",
      name: "Gujarat",
      nameHi: "गुजरात",
      divisions: [
        { code: "GJ-KUTCH", name: "Kutch", nameHi: "कच्छ", hint: "Bhuj, Gandhidham", hintHi: "भुज, गांधीधाम" },
        { code: "GJ-SAURASHTRA", name: "Saurashtra", nameHi: "सौराष्ट्र", hint: "Rajkot, Jamnagar, Bhavnagar", hintHi: "राजकोट" },
      ],
    },
    { code: "MP", name: "Madhya Pradesh", nameHi: "मध्य प्रदेश", divisions: [] },
  ],
};
const AJMER: NearbyPlace = { name: "Ajmer", region: "Rajasthan", pincode: null, latitude: 26.4521, longitude: 74.6387 };
const board = (extra: Partial<RewardScan> = {}): RewardScan => ({
  token: TOKEN,
  projectId: "p1",
  role: "PAINTER",
  points: 25,
  claimable: true,
  reason: null,
  retailerClaimed: true,
  painterClaimed: false,
  expiresAt: ist(300 * DAY),
  ...extra,
});
const voucher = (id: string, extra: Partial<Redemption> = {}): Redemption => ({
  id,
  itemCode: "BRUSH",
  itemTitle: "Brush set",
  category: "TOOLS",
  pointsSpent: 300,
  voucherCode: "HV-AB12-CD34",
  status: "PENDING",
  requestedAt: ist(-DAY),
  ...extra,
});

const offline = () => new ApiError("network", 0, "offline");

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  for (const group of [mockRewards, mockPainter, mockMe, mockLocation, mockPicker, mockNearby]) {
    for (const fn of Object.values(group)) if (typeof fn === "function" && "mockReset" in fn) (fn as jest.Mock).mockReset();
  }
  mockLocation.hasServicesEnabledAsync.mockResolvedValue(true);
  mockLocation.getLastKnownPositionAsync.mockResolvedValue(null);
  mockNearby.workAreas.mockResolvedValue(WORK_AREAS);
  mockAuth.profile.mockReset();
  mockAuth.setCustomerProfile.mockReset();
  mockAuth.switchProfile.mockReset();
  mockReadFile.statFile.mockClear();
  mockReadFile.readFileBase64.mockClear();
  mockReader.props = null;
  mockReader.mounts = 0;
  mockPermission = { granted: true, canAskAgain: true };
  mockRequestPermission.mockClear();
  takeSharedBoard();
  forgetRememberedRoute();
  queryClient.clear();
  await AsyncStorage.clear();

  signedInAs("PAINTER");
  mockRewards.wallet.mockResolvedValue(wallet());
  mockRewards.catalogue.mockResolvedValue([reward("BRUSH"), reward("GLOVES", { category: "SAFETY", pointsCost: 1300, affordable: false, pointsShort: 50 }), reward("AMAZON", { category: "VOUCHER", inStock: false, stock: 0, affordable: false })]);
  mockRewards.redemptions.mockResolvedValue([]);
  mockRewards.scan.mockResolvedValue(board());
  mockPainter.profile.mockResolvedValue(painter());
});

/** Lets a query, a sheet's animation or a timer move on. */
const tick = (ms = 50) => act(async () => jest.advanceTimersByTime(ms));

// ── P1 · Home ─────────────────────────────────────────────────────────────────

describe("P1 · Home", () => {
  it("shows the balance, the batch about to lapse, and the reward in reach", async () => {
    renderRouter("./app", { initialUrl: "/painter" });
    await waitFor(() => expect(screen.getByTestId("painter-balance")).toBeTruthy());
    expect(screen.getByLabelText("1,250")).toBeTruthy();
    expect(screen.getByTestId("painter-expiry")).toHaveTextContent(/120 points expire in 3 days\./);
    await waitFor(() => expect(screen.getByText("Ready to redeem: Brush set")).toBeTruthy());
    expect(screen.getByText("Board for the Sharma flat")).toBeTruthy();
  });

  it("nudges a hidden painter to be found nearby", async () => {
    mockPainter.profile.mockResolvedValue(painter({ listedForCustomers: false }));
    renderRouter("./app", { initialUrl: "/painter" });
    await waitFor(() => expect(screen.getByTestId("painter-nudge")).toBeTruthy());
    fireEvent.press(screen.getByText("Set up"));
    await waitFor(() => expect(screen).toHavePathname("/painter/nearby"));
  });

  it("tells a painter who isn't certified that customers only see certified painters", async () => {
    mockPainter.profile.mockResolvedValue(painter({ certified: false, certifiedUntil: null }));
    renderRouter("./app", { initialUrl: "/painter" });
    await waitFor(() => expect(screen.getByTestId("painter-certification")).toBeTruthy());
    expect(screen.getByText("Get HueVistaa Certified")).toBeTruthy();
    expect(screen.getByText("Only certified painters are shown to customers looking for a painter nearby.")).toBeTruthy();
  });

  it("asks for the renewal a month before the year ends, and not before", async () => {
    mockPainter.profile.mockResolvedValue(painter({ certifiedUntil: ist(12 * DAY) }));
    renderRouter("./app", { initialUrl: "/painter" });
    await waitFor(() => expect(screen.getByTestId("painter-certification")).toBeTruthy());
    expect(screen.getByText("Renew HueVistaa Certified")).toBeTruthy();
  });

  it("says nothing about certification while a year has long to run", async () => {
    renderRouter("./app", { initialUrl: "/painter" });
    await waitFor(() => expect(screen.getByTestId("painter-balance")).toBeTruthy());
    await waitFor(() => expect(mockPainter.profile).toHaveBeenCalled());
    expect(screen.queryByTestId("painter-certification")).toBeNull();
  });

  it("says so when the points won't load", async () => {
    mockRewards.wallet.mockRejectedValue(new ApiError("http", 503, "busy"));
    renderRouter("./app", { initialUrl: "/painter" });
    await waitFor(() => expect(mockRewards.wallet).toHaveBeenCalled());
    // Past the query's own retries.
    for (let i = 0; i < 6; i++) await tick(10_000);
    await waitFor(() => expect(screen.getByText("Couldn't load your points.")).toBeTruthy());
    expect(screen.queryByTestId("painter-balance")).toBeNull();
  });
});

// ── P2 · Points ───────────────────────────────────────────────────────────────

describe("P2 · Points", () => {
  it("lists batches by date, rewards on their way and the latest movements", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, points: i === 1 ? -300 : 25, type: i === 1 ? "SPENT_ON_PAINTER_REWARD" : "PROJECT_QR_EARNED", label: `Row ${i}`, createdAt: ist(-i * DAY) }));
    mockRewards.wallet.mockResolvedValue(wallet({ recentActivity: rows }));
    renderRouter("./app", { initialUrl: "/painter/points" });
    await waitFor(() => expect(screen.getByTestId("points-batches")).toBeTruthy());
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.getByText("200 days")).toBeTruthy();
    expect(screen.getByText("Your latest 20 movements.")).toBeTruthy();
    expect(screen.getByText("−300")).toBeTruthy();
    fireEvent.press(screen.getByText("1 reward on its way"));
    await waitFor(() => expect(screen).toHavePathname("/painter/vouchers"));
  });
});

// ── P3 · Scan, P8 · Type the code ─────────────────────────────────────────────

describe("P3 · Scan", () => {
  it("asks for the camera first", async () => {
    mockPermission = { granted: false, canAskAgain: true };
    renderRouter("./app", { initialUrl: "/painter/scan" });
    await waitFor(() => expect(screen.getByTestId("scan-permission")).toBeTruthy());
    fireEvent.press(screen.getByTestId("scan-allow"));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it("once the camera is refused, says how to turn it back on, and keeps the other ways in", async () => {
    mockPermission = { granted: false, canAskAgain: false };
    renderRouter("./app", { initialUrl: "/painter/scan" });
    await waitFor(() => expect(screen.getByText("Camera is off for HueVistaa")).toBeTruthy());
    expect(screen.getByText("Open settings")).toBeTruthy();
    expect(screen.queryByTestId("scan-allow")).toBeNull();
    fireEvent.press(screen.getByTestId("scan-pdf"));
    await waitFor(() => expect(screen).toHavePathname("/painter/upload-board"));
  });

  it("turns the camera on once it's allowed in the phone's Settings", async () => {
    const appState = AppState.addEventListener as jest.Mock;
    const from = appState.mock.calls.length;
    mockPermission = { granted: false, canAskAgain: false };
    renderRouter("./app", { initialUrl: "/painter/scan" });
    await waitFor(() => expect(screen.getByText("Camera is off for HueVistaa")).toBeTruthy());
    mockPermission = { granted: true, canAskAgain: true };
    await act(async () => {
      for (const [type, listener] of appState.mock.calls.slice(from)) if (type === "change") listener("active");
    });
    await waitFor(() => expect(screen.getByTestId("camera")).toBeTruthy());
  });

  // Tabs stay mounted: the scan tab reads the permission again each time it is shown.
  it("reads the permission again on coming back to the tab", async () => {
    mockPermission = { granted: false, canAskAgain: false };
    renderRouter("./app", { initialUrl: "/painter/scan" });
    await waitFor(() => expect(screen.getByText("Camera is off for HueVistaa")).toBeTruthy());
    fireEvent.press(screen.getByTestId("scan-pdf"));
    await waitFor(() => expect(screen).toHavePathname("/painter/upload-board"));
    mockPermission = { granted: true, canAskAgain: true };
    act(() => router.back());
    await waitFor(() => expect(screen.getByTestId("camera")).toBeTruthy());
  });

  it("turns away someone else's QR on the spot, and takes a board's to the claim", async () => {
    renderRouter("./app", { initialUrl: "/painter/scan" });
    await waitFor(() => expect(screen.getByTestId("camera")).toBeTruthy());
    fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: "upi://pay?pa=shop@okbank" });
    expect(screen.getByTestId("scan-not-ours")).toBeTruthy();
    expect(mockRewards.scan).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: `https://app.huevista.org/r/${TOKEN}` });
    await waitFor(() => expect(screen).toHavePathname(`/painter/claim/${TOKEN}`));
  });

  it("takes a typed code or a pasted link, and refuses anything else", async () => {
    renderRouter("./app", { initialUrl: "/painter/type-code" });
    await waitFor(() => expect(screen.getByTestId("type-code-field")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("type-code-field"), "https://example.com/menu");
    fireEvent.press(screen.getByTestId("type-code-check"));
    expect(screen.getByText(/That isn't one of our codes/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("type-code-field"), ` app.huevista.org/r/${TOKEN} `);
    fireEvent.press(screen.getByTestId("type-code-check"));
    await waitFor(() => expect(screen).toHavePathname(`/painter/claim/${TOKEN}`));
  });
});

// ── P6 · Claim a board ────────────────────────────────────────────────────────

describe("P6 · Claim a board", () => {
  it("says what the board is worth, claims it and counts it in", async () => {
    mockRewards.claim.mockResolvedValue({ projectId: "p1", role: "PAINTER", pointsAwarded: 25, balance: 1275, claimedAt: ist(0) });
    renderRouter("./app", { initialUrl: `/painter/claim/${TOKEN}` });
    await waitFor(() => expect(screen.getByText("This board is worth 25 points to you.")).toBeTruthy());
    fireEvent.press(screen.getByTestId("claim-go"));
    await waitFor(() => expect(screen.getByTestId("claim-landed")).toBeTruthy());
    expect(mockRewards.claim).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByLabelText("+25")).toBeTruthy();
    expect(screen.getByText(/Your balance is now 1,275 points\./)).toBeTruthy();
    fireEvent.press(screen.getByTestId("claim-scan-another"));
    await waitFor(() => expect(screen).toHavePathname("/painter/scan"));
  });

  it("says in the server's words why a board can't be claimed", async () => {
    mockRewards.scan.mockResolvedValue(board({ claimable: false, painterClaimed: true, reason: "This board has already paid a painter." }));
    renderRouter("./app", { initialUrl: `/painter/claim/${TOKEN}` });
    await waitFor(() => expect(screen.getByText("Nothing to claim here.")).toBeTruthy());
    expect(screen.getByTestId("claim-reason")).toHaveTextContent("This board has already paid a painter.");
    expect(screen.queryByTestId("claim-go")).toBeNull();
  });

  // No answer is not no: the points are looked at before anything is said.
  it("after a lost answer, finds the points landed and says so", async () => {
    mockRewards.claim.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: `/painter/claim/${TOKEN}` });
    await waitFor(() => expect(screen.getByTestId("claim-go")).toBeTruthy());
    const paid = wallet({ balance: 1275, recentActivity: [{ id: "new", points: 25, type: "PROJECT_QR_EARNED", label: "Board", createdAt: ist(0) }, ...wallet().recentActivity] });
    mockRewards.wallet.mockResolvedValue(paid);
    mockRewards.scan.mockResolvedValue(board({ claimable: false, painterClaimed: true, reason: "Claimed by you." }));
    fireEvent.press(screen.getByTestId("claim-go"));
    await waitFor(() => expect(screen.getByTestId("claim-landed")).toBeTruthy());
    expect(screen.getByText(/Your balance is now 1,275 points\./)).toBeTruthy();
  });

  // Another board's 25 points, a minute ago, look just like this one's in the statement.
  it("after a lost answer, doesn't take another board's points for this one's", async () => {
    mockRewards.claim.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: `/painter/claim/${TOKEN}` });
    await waitFor(() => expect(screen.getByTestId("claim-go")).toBeTruthy());
    mockRewards.wallet.mockResolvedValue(wallet({ recentActivity: [{ id: "other", points: 25, type: "PROJECT_QR_EARNED", label: "Another board", createdAt: ist(-60_000) }] }));
    fireEvent.press(screen.getByTestId("claim-go"));
    await waitFor(() => expect(screen.getByTestId("claim-error")).toHaveTextContent(/this board hasn't paid you/));
    expect(screen.queryByTestId("claim-landed")).toBeNull();
  });

  it("after a lost answer with nothing landed, says the board hasn't paid", async () => {
    mockRewards.claim.mockRejectedValue(offline());
    renderRouter("./app", { initialUrl: `/painter/claim/${TOKEN}` });
    await waitFor(() => expect(screen.getByTestId("claim-go")).toBeTruthy());
    fireEvent.press(screen.getByTestId("claim-go"));
    await waitFor(() => expect(screen.getByTestId("claim-error")).toHaveTextContent(/this board hasn't paid you\. Try again\./));
    expect(screen.queryByTestId("claim-landed")).toBeNull();
  });

  it("after a refusal, reads the board again and shows how it stands now", async () => {
    mockRewards.claim.mockRejectedValue(new ApiError("http", 409, "Someone has just claimed this board."));
    renderRouter("./app", { initialUrl: `/painter/claim/${TOKEN}` });
    await waitFor(() => expect(screen.getByTestId("claim-go")).toBeTruthy());
    mockRewards.scan.mockResolvedValue(board({ claimable: false, painterClaimed: true, reason: "This board has already paid a painter." }));
    fireEvent.press(screen.getByTestId("claim-go"));
    await waitFor(() => expect(screen.getByText("Nothing to claim here.")).toBeTruthy());
    expect(screen.getByTestId("claim-reason")).toHaveTextContent("This board has already paid a painter.");
    // Said once, by the board — not again in a banner.
    expect(screen.queryByTestId("claim-error")).toBeNull();
  });

  it("refuses a link that carries none of our codes without asking the server", async () => {
    renderRouter("./app", { initialUrl: "/painter/claim/nope" });
    await waitFor(() => expect(screen.getByText("That link doesn't carry one of our codes.")).toBeTruthy());
    expect(mockRewards.scan).not.toHaveBeenCalled();
  });
});

// ── P7 · Board came as a PDF ──────────────────────────────────────────────────

describe("P7 · Board came as a PDF", () => {
  const picked = (extra: object = {}) =>
    mockPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/Sharma board.pdf", name: "Sharma board.pdf", mimeType: "application/pdf", size: 70_000, ...extra }] });

  it("reads a picked PDF on the phone, last page first, and goes on to the claim", async () => {
    picked();
    renderRouter("./app", { initialUrl: "/painter/upload-board" });
    await waitFor(() => expect(screen.getByTestId("upload-choose")).toBeTruthy());
    fireEvent.press(screen.getByTestId("upload-choose"));
    await waitFor(() => expect(mockReader.props).not.toBeNull());
    expect(mockReader.props!.job).toEqual({ base64: "JVBERi0xLjQK", kind: "pdf", mime: "application/pdf" });
    expect(screen.getByText("Sharma board.pdf")).toBeTruthy();
    await act(async () => mockReader.props!.onProgress({ page: 4, pages: 4 }));
    expect(screen.getByText("Reading the board… Page 4 of 4")).toBeTruthy();
    await act(async () => mockReader.props!.onDone({ kind: "found", token: TOKEN }));
    await waitFor(() => expect(screen).toHavePathname(`/painter/claim/${TOKEN}`));
  });

  it("says when there's no board code in it, and offers the other ways", async () => {
    picked();
    renderRouter("./app", { initialUrl: "/painter/upload-board" });
    await waitFor(() => expect(screen.getByTestId("upload-choose")).toBeTruthy());
    fireEvent.press(screen.getByTestId("upload-choose"));
    await waitFor(() => expect(mockReader.props).not.toBeNull());
    await act(async () => mockReader.props!.onDone({ kind: "none" }));
    expect(screen.getByText(/We couldn't find a board code in Sharma board.pdf\./)).toBeTruthy();
    expect(screen.getByTestId("upload-another")).toBeTruthy();
    expect(screen.getByText("Type the code")).toBeTruthy();
    expect(screen.queryByTestId("board-reader")).toBeNull();
  });

  it("refuses a file over 25 MB before reading a byte of it", async () => {
    picked({ size: 30 * 1024 * 1024 });
    renderRouter("./app", { initialUrl: "/painter/upload-board" });
    await waitFor(() => expect(screen.getByTestId("upload-choose")).toBeTruthy());
    fireEvent.press(screen.getByTestId("upload-choose"));
    await waitFor(() => expect(screen.getByTestId("upload-problem")).toHaveTextContent(/over 25 MB/));
    expect(mockReadFile.readFileBase64).not.toHaveBeenCalled();
  });

  it("says a password-protected PDF needs unlocking", async () => {
    picked();
    renderRouter("./app", { initialUrl: "/painter/upload-board" });
    await waitFor(() => expect(screen.getByTestId("upload-choose")).toBeTruthy());
    fireEvent.press(screen.getByTestId("upload-choose"));
    await waitFor(() => expect(mockReader.props).not.toBeNull());
    await act(async () => mockReader.props!.onDone({ kind: "error", code: "locked" }));
    expect(screen.getByTestId("upload-problem")).toHaveTextContent(/password-protected/);
  });

  it("stops reading when asked, and a late answer changes nothing", async () => {
    picked();
    renderRouter("./app", { initialUrl: "/painter/upload-board" });
    await waitFor(() => expect(screen.getByTestId("upload-choose")).toBeTruthy());
    fireEvent.press(screen.getByTestId("upload-choose"));
    await waitFor(() => expect(mockReader.props).not.toBeNull());
    const late = mockReader.props!.onDone;
    fireEvent.press(screen.getByTestId("upload-stop"));
    expect(screen.queryByTestId("board-reader")).toBeNull();
    await act(async () => late({ kind: "found", token: TOKEN }));
    expect(screen).toHavePathname("/painter/upload-board");
    expect(screen.getByTestId("upload-choose")).toBeTruthy();
  });

  it("reads a PDF another app opened us with, straight away", async () => {
    const to = holdSharedBoard("content://com.whatsapp.provider.media/item/42");
    mockReadFile.statFile.mockReturnValue({ name: "Board from Sharma.pdf", mime: "application/pdf", size: 70_000 });
    renderRouter("./app", { initialUrl: to });
    await waitFor(() => expect(mockReader.props).not.toBeNull());
    expect(mockReadFile.readFileBase64).toHaveBeenCalledWith("content://com.whatsapp.provider.media/item/42");
    expect(screen.getByText("Opened from another app")).toBeTruthy();
    expect(screen.getByText("Board from Sharma.pdf")).toBeTruthy();
    expect(mockPicker.getDocumentAsync).not.toHaveBeenCalled();
  });
});

// ── P4 · Rewards, P9 · Reward, P10/P11 · Vouchers ─────────────────────────────

describe("P4 · Rewards", () => {
  it("prices every reward against the balance, and narrows by kind", async () => {
    renderRouter("./app", { initialUrl: "/painter/rewards" });
    await waitFor(() => expect(screen.getByTestId("reward-BRUSH")).toBeTruthy());
    expect(screen.getByText("Ready to redeem")).toBeTruthy();
    expect(screen.getByText("50 points to go")).toBeTruthy();
    expect(screen.getByText("Out of stock")).toBeTruthy();
    fireEvent.press(screen.getByTestId("rewards-kind-SAFETY"));
    expect(screen.queryByTestId("reward-BRUSH")).toBeNull();
    expect(screen.getByTestId("reward-GLOVES")).toBeTruthy();
    fireEvent.press(screen.getByTestId("reward-GLOVES"));
    await waitFor(() => expect(screen).toHavePathname("/painter/reward/GLOVES"));
  });

  it("asks for a mobile number before anything is redeemed", async () => {
    mockPainter.profile.mockResolvedValue(painter({ phone: null, phoneVerified: false }));
    renderRouter("./app", { initialUrl: "/painter/rewards" });
    await waitFor(() => expect(screen.getByTestId("rewards-no-phone")).toBeTruthy());
  });
});

describe("P9 · Reward", () => {
  const confirm = () => fireEvent.press(screen.getByTestId("redeem-sheet-confirm"));

  it("redeems after a confirm that says who will call, and opens the voucher", async () => {
    mockRewards.redeem.mockResolvedValue(voucher("r1"));
    renderRouter("./app", { initialUrl: "/painter/reward/BRUSH" });
    await waitFor(() => expect(screen.getByTestId("reward-redeem")).not.toBeDisabled());
    fireEvent.press(screen.getByTestId("reward-redeem"));
    await waitFor(() => expect(screen.getByText("We'll call +91 98765 43210 to arrange delivery.")).toBeTruthy());
    expect(screen.getByText(/300 points come off your balance now\./)).toBeTruthy();
    confirm();
    await waitFor(() => expect(screen).toHavePathname("/painter/voucher/r1"));
    expect(mockRewards.redeem).toHaveBeenCalledWith("BRUSH", expect.any(String));
    await waitFor(() => expect(screen.getByText("HV-AB12-CD34")).toBeTruthy());
    expect(screen.getByText("Redeemed")).toBeTruthy();
    expect(screen.getByTestId("voucher-next")).toHaveTextContent(/call you on \+91 98765 43210/);
  });

  // The same key twice: the server hands back the redemption it made, never a second one.
  it("tries a lost answer again with the same key", async () => {
    mockRewards.redeem.mockRejectedValueOnce(offline()).mockResolvedValueOnce(voucher("r1"));
    renderRouter("./app", { initialUrl: "/painter/reward/BRUSH" });
    await waitFor(() => expect(screen.getByTestId("reward-redeem")).not.toBeDisabled());
    fireEvent.press(screen.getByTestId("reward-redeem"));
    await waitFor(() => expect(screen.getByTestId("redeem-sheet-confirm")).toBeTruthy());
    confirm();
    await waitFor(() => expect(screen.getByText("We couldn't hear back. Press Redeem again — it won't be spent twice.")).toBeTruthy());
    confirm();
    await waitFor(() => expect(screen).toHavePathname("/painter/voucher/r1"));
    const keysSent = mockRewards.redeem.mock.calls.map((call) => call[1]);
    expect(keysSent).toHaveLength(2);
    expect(keysSent[1]).toBe(keysSent[0]);
  });

  it("can't be pressed short of points, and says how many more", async () => {
    renderRouter("./app", { initialUrl: "/painter/reward/GLOVES" });
    await waitFor(() => expect(screen.getByTestId("reward-redeem")).toHaveTextContent("50 points to go"));
    expect(screen.getByTestId("reward-redeem")).toBeDisabled();
  });
});

describe("P10 · P11 · Vouchers", () => {
  it("puts what's on its way first, and says why a refund happened", async () => {
    mockRewards.redemptions.mockResolvedValue([
      voucher("r2", { itemTitle: "Safety gloves", status: "REJECTED", rejectionReason: "Out of stock at the depot", voucherCode: "HV-ZZ99-YY88", pointsSpent: 150 }),
      voucher("r1"),
    ]);
    renderRouter("./app", { initialUrl: "/painter/vouchers" });
    await waitFor(() => expect(screen.getByText("On their way")).toBeTruthy());
    expect(screen.getByText(/Out of stock at the depot — 150 points went back on your balance\./)).toBeTruthy();
    fireEvent.press(screen.getByTestId("voucher-r1"));
    await waitFor(() => expect(screen).toHavePathname("/painter/voucher/r1"));
    expect(screen.getByText("On its way")).toBeTruthy();
  });

  it("says so when a voucher isn't on this account", async () => {
    mockRewards.redemptions.mockResolvedValue([voucher("r1")]);
    renderRouter("./app", { initialUrl: "/painter/voucher/someone-elses" });
    await waitFor(() => expect(screen.getByText("This voucher isn't on your account.")).toBeTruthy());
  });
});

// ── P5 · Nearby ───────────────────────────────────────────────────────────────

describe("P5 · Nearby", () => {
  it("needs a location before listing, and sends it rounded to about a kilometre", async () => {
    mockPainter.profile.mockResolvedValue(painter({ listedForCustomers: false, latitude: null, longitude: null, locationUpdatedAt: null }));
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLocation.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 19.076543, longitude: 72.877712, accuracy: 25 } });
    mockPainter.updateListing.mockImplementation(async (body) => painter({ ...body, latitude: body.latitude, longitude: body.longitude }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-needs")).toBeTruthy());
    expect(screen.getByText("Set your location below")).toBeTruthy();
    expect(screen.getByTestId("nearby-switch")).toBeDisabled();

    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("nearby-location-status")).toHaveTextContent("New location ready. Save to use it."));
    fireEvent(screen.getByTestId("nearby-switch"), "valueChange", true);
    fireEvent.press(screen.getByTestId("nearby-save"));
    await waitFor(() => expect(mockPainter.updateListing).toHaveBeenCalled());
    expect(mockPainter.updateListing).toHaveBeenCalledWith({ listedForCustomers: true, latitude: 19.08, longitude: 72.88 });
    await waitFor(() => expect(screen.getByText("Saved. Customers near you can see you now.")).toBeTruthy());
  });

  it("previews the card a customer sees: photo, name and address, and nothing else", async () => {
    mockPainter.profile.mockResolvedValue(painter({ address: "Naupada, Thane", photoVersion: "1730000000000", about: "Twenty years in Thane" }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-preview")).toBeTruthy());
    const card = within(screen.getByTestId("nearby-preview"));
    expect(card.getByText("Ravi Kumar")).toBeTruthy();
    expect(card.getByText("Naupada, Thane")).toBeTruthy();
    expect(card.getByLabelText("Photo of Ravi Kumar")).toBeTruthy();
    // The old line about them, their kinds of work and years stay off it, and aren't asked for.
    expect(card.queryByText(/Twenty years|Textures|12 yrs/)).toBeNull();
    expect(screen.queryByTestId("nearby-about")).toBeNull();
  });

  /**
   * Only certified painters are shown, but the switch stays the painter's: the listing is
   * saved, and goes live once they're certified. The way to the year is offered only where
   * the app may send a painter to the website to pay — never in the Play build.
   */
  it("saves a listing before certification, and says it goes live once certified", async () => {
    mockPainter.profile.mockResolvedValue(painter({ listedForCustomers: false, certified: false, certifiedUntil: null }));
    mockPainter.updateListing.mockImplementation(async (body) => painter({ ...body, certified: false, certifiedUntil: null }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-certified")).toBeTruthy());
    expect(screen.getByText("Only HueVistaa Certified painters are shown to customers")).toBeTruthy();

    fireEvent(screen.getByTestId("nearby-switch"), "valueChange", true);
    expect(screen.getByText("On — customers will see you once you're HueVistaa Certified.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("nearby-save"));
    await waitFor(() => expect(screen.getByText("Saved. Customers will see you once you're HueVistaa Certified.")).toBeTruthy());
  });

  it("links to the year on the website only where the app may send a painter to pay", async () => {
    mockPainter.profile.mockResolvedValue(painter({ certified: false, certifiedUntil: null }));
    const mode = jest.spyOn(env, "paymentsMode").mockReturnValue("play");
    try {
      renderRouter("./app", { initialUrl: "/painter/nearby" });
      await waitFor(() => expect(screen.getByTestId("nearby-certified")).toBeTruthy());
      expect(screen.queryByText("Get certified")).toBeNull();
    } finally {
      mode.mockRestore();
    }
  });

  it("opens the painter website's certification page in a web-payments build", async () => {
    mockPainter.profile.mockResolvedValue(painter({ certified: false, certifiedUntil: null }));
    const mode = jest.spyOn(env, "paymentsMode").mockReturnValue("web");
    try {
      renderRouter("./app", { initialUrl: "/painter/nearby" });
      await waitFor(() => expect(screen.getByText("Get certified")).toBeTruthy());
      fireEvent.press(screen.getByText("Get certified"));
      await waitFor(() =>
        expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
          expect.stringMatching(/\/certified$/),
          expect.anything(),
        ),
      );
    } finally {
      mode.mockRestore();
    }
  });

  it("shows a certified painter until when, with the badge on their preview", async () => {
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-certified")).toHaveTextContent(/HueVistaa Certified until/));
    expect(screen.getByTestId("painter-certified")).toBeTruthy();
  });

  it("offers Settings when location has been refused for good", async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("nearby-location-error")).toHaveTextContent(/Location is off for HueVistaa/));
    expect(screen.getByText("Open settings")).toBeTruthy();
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  /**
   * Android's location service can take far longer than anybody waits indoors, or never answer
   * at all. The button used to say "Finding you…" for ever, with Save greyed out; now it gives up
   * after fifteen seconds, says so, and the painter can try again or type their town.
   */
  it("gives up on a phone that never finds itself, rather than finding for ever", async () => {
    mockPainter.profile.mockResolvedValue(painter({ listedForCustomers: false, latitude: null, longitude: null, locationUpdatedAt: null }));
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(mockLocation.getCurrentPositionAsync).toHaveBeenCalled());
    await tick(14_000);
    expect(screen.queryByTestId("nearby-location-error")).toBeNull();
    await tick(1_000);
    await waitFor(() => expect(screen.getByTestId("nearby-location-error")).toHaveTextContent(/Couldn't get a location from your phone/));
    expect(screen.getByTestId("nearby-locate")).toHaveTextContent(/Use where I am now/);
  });

  it("takes a fix from the last half hour when a fresh one doesn't come", async () => {
    mockPainter.profile.mockResolvedValue(painter({ listedForCustomers: false, latitude: null, longitude: null, locationUpdatedAt: null }));
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLocation.getCurrentPositionAsync.mockRejectedValue(new Error("Current location is unavailable."));
    mockLocation.getLastKnownPositionAsync.mockImplementation(async (options?: { maxAge?: number }) =>
      (options?.maxAge ?? 0) > 60_000 ? { coords: { latitude: 26.912345, longitude: 75.787654, accuracy: 400 } } : null,
    );
    mockPainter.updateListing.mockImplementation(async (body) => painter({ ...body }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("nearby-location-status")).toHaveTextContent("New location ready. Save to use it."));
    fireEvent.press(screen.getByTestId("nearby-save"));
    await waitFor(() => expect(mockPainter.updateListing).toHaveBeenCalledWith({ listedForCustomers: false, latitude: 26.91, longitude: 75.79 }));
  });

  it("says location is off on the phone, rather than refused", async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-locate")).toBeTruthy());
    fireEvent.press(screen.getByTestId("nearby-locate"));
    await waitFor(() => expect(screen.getByTestId("nearby-location-error")).toHaveTextContent(/Location is off on your phone\. Turn it on and try again\./));
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  // A phone that can't say where it is is not the end of it: the painter types their town or PIN.
  it("takes a town or PIN code typed instead, and saves it", async () => {
    mockPainter.profile.mockResolvedValue(painter({ listedForCustomers: false, latitude: null, longitude: null, locationUpdatedAt: null }));
    mockNearby.places.mockResolvedValue([AJMER, { name: "Ajmer Road", region: "Jaipur, Rajasthan", pincode: "302006", latitude: 26.9, longitude: 75.75 }]);
    mockPainter.updateListing.mockImplementation(async (body) => painter({ ...body, locationName: "Kaiser Ganj Ajmer, Ajmer, Rajasthan", locationUpdatedAt: ist(0) }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-place")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("nearby-place"), "Ajmer");
    await act(async () => fireEvent.press(screen.getByTestId("nearby-place-search")));
    expect(mockNearby.places).toHaveBeenCalledWith("Ajmer");
    fireEvent.press(screen.getByText("Ajmer, Rajasthan"));
    expect(screen.getByTestId("nearby-location-status")).toHaveTextContent("New location: Ajmer, Rajasthan. Save to use it.");
    expect(screen.getByTestId("nearby-place-credit")).toHaveTextContent(/India Post.*GeoNames/);

    fireEvent.press(screen.getByTestId("nearby-save"));
    await waitFor(() => expect(mockPainter.updateListing).toHaveBeenCalledWith({ listedForCustomers: false, latitude: 26.45, longitude: 74.64 }));
    // Saved, the screen names the place the base is in.
    await waitFor(() => expect(screen.getByTestId("nearby-location-status")).toHaveTextContent("Near Kaiser Ganj Ajmer, Ajmer, Rajasthan"));
  });

  it("says when a typed place can't be found", async () => {
    mockNearby.places.mockResolvedValue([]);
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("nearby-place")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("nearby-place"), "999999");
    await act(async () => fireEvent.press(screen.getByTestId("nearby-place-search")));
    await waitFor(() => expect(screen.getByTestId("nearby-place-problem")).toHaveTextContent(/We don't know the PIN code 999999\./));
  });

  /**
   * Where the painter can go for a job: Rajasthan's divisions first, then Gujarat, then other
   * states — on the preview as a customer will read it, before it is saved.
   */
  it("saves where the painter can work, Rajasthan's divisions first", async () => {
    mockPainter.updateListing.mockImplementation(async (body) => painter({ ...body }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("area-RJ-AJMER")).toBeTruthy());
    fireEvent.press(screen.getByTestId("area-RJ-AJMER"));
    fireEvent.press(screen.getByTestId("area-RJ-JAIPUR"));
    fireEvent.press(screen.getByTestId("area-GJ-SAURASHTRA"));
    // The other states fold away until asked for.
    expect(screen.queryByTestId("area-MP")).toBeNull();
    fireEvent.press(screen.getByTestId("area-more"));
    fireEvent.press(screen.getByTestId("area-MP"));
    expect(within(screen.getByTestId("nearby-preview")).getByText("Works in Ajmer, Jaipur (Rajasthan) · Saurashtra (Gujarat) · Madhya Pradesh")).toBeTruthy();

    fireEvent.press(screen.getByTestId("nearby-save"));
    await waitFor(() =>
      expect(mockPainter.updateListing).toHaveBeenCalledWith({ listedForCustomers: true, workAreas: ["RJ-AJMER", "RJ-JAIPUR", "GJ-SAURASHTRA", "MP"] }),
    );
  });

  it("ticks all of Rajasthan at once, and anywhere in India says it all", async () => {
    mockPainter.updateListing.mockImplementation(async (body) => painter({ ...body }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByTestId("area-RJ")).toBeTruthy());
    fireEvent.press(screen.getByTestId("area-RJ"));
    expect(screen.getByTestId("area-RJ-KOTA")).toBeSelected();
    expect(within(screen.getByTestId("nearby-preview")).getByText("Works in Rajasthan")).toBeTruthy();

    fireEvent(screen.getByTestId("area-anywhere"), "valueChange", true);
    expect(within(screen.getByTestId("nearby-preview")).getByText("Works anywhere in India")).toBeTruthy();
    expect(screen.getByTestId("area-RJ-KOTA")).toBeDisabled();
    fireEvent.press(screen.getByTestId("nearby-save"));
    await waitFor(() => expect(mockPainter.updateListing).toHaveBeenCalledWith({ listedForCustomers: true, workAreas: ["IN"] }));
  });

  it("leaves the places alone, and says so, when their names can't be loaded", async () => {
    mockNearby.workAreas.mockRejectedValue(new ApiError("http", 404, "Not found"));
    mockPainter.profile.mockResolvedValue(painter({ workAreas: ["RJ-AJMER"] }));
    renderRouter("./app", { initialUrl: "/painter/nearby" });
    await waitFor(() => expect(screen.getByText("Couldn't load the list of places.")).toBeTruthy());
    expect(screen.queryByTestId("nearby-areas")).toBeNull();
  });
});

// ── P12 · Trade profile ───────────────────────────────────────────────────────

describe("P12 · Trade profile", () => {
  it("adds and removes areas and specialties, and saves the trade without a phone", async () => {
    mockPainter.updateProfile.mockImplementation(async (body) => painter(body));
    renderRouter("./app", { initialUrl: "/painter/profile" });
    await waitFor(() => expect(screen.getByTestId("profile-areas")).toBeTruthy());
    expect(screen.getByText("4.6 from 18 reviews")).toBeTruthy();
    expect(screen.getByText("40 jobs finished")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("e.g. Mount Abu"), "  Navi   Mumbai ");
    fireEvent.press(screen.getAllByText("Add")[0]!);
    fireEvent.press(screen.getByLabelText("Remove Thane"));
    fireEvent.press(screen.getByText("+ Interiors"));
    fireEvent.changeText(screen.getByTestId("profile-years"), "");
    fireEvent.press(screen.getByTestId("profile-save"));
    await waitFor(() => expect(mockPainter.updateProfile).toHaveBeenCalled());
    expect(mockPainter.updateProfile).toHaveBeenCalledWith({ serviceAreas: ["Navi Mumbai"], specialties: ["Textures", "Interiors"], yearsExperience: null, dayRateInr: 1500 });
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
  });

  it("won't save a number that isn't whole", async () => {
    renderRouter("./app", { initialUrl: "/painter/profile" });
    await waitFor(() => expect(screen.getByTestId("profile-years")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("profile-years"), "1.5");
    expect(screen.getByText("Whole numbers only.")).toBeTruthy();
    expect(screen.getByTestId("profile-save")).toBeDisabled();
  });

  /** Where a switch to the customer profile lands: the customer's home, with nothing on it yet. */
  const emptyCustomerHome = () => {
    mockMe.entitlement.mockResolvedValue(null);
    mockMe.aiCredits.mockResolvedValue({ balance: 0, eligible: false });
    mockMe.projects.mockResolvedValue([]);
    mockMe.renders.mockResolvedValue([]);
  };

  /** The painter's own home: a customer profile behind the same sign-in, one tap away. */
  it("switches to the painter's own home, turning the customer profile on first", async () => {
    emptyCustomerHome();
    mockAuth.setCustomerProfile.mockResolvedValue({ id: "u1", name: "Ravi Kumar", provider: "LOCAL", role: "PAINTER", switchTo: "CUSTOMER" });
    mockAuth.switchProfile.mockImplementation(async () => {
      mockAuth.profile.mockResolvedValue({ id: "p1", name: "Ravi Kumar", provider: "LOCAL", role: "CUSTOMER", linkedProfile: true, switchTo: "PAINTER" });
      return { accessToken: "access-p", refreshToken: "refresh-p" };
    });
    renderRouter("./app", { initialUrl: "/painter/profile" });
    await waitFor(() => expect(screen.getByTestId("painter-own-home")).toBeTruthy());
    expect(screen.getByText(/Planning your own rooms\?/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("painter-own-home"));

    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAuth.setCustomerProfile).toHaveBeenCalledWith(true);
    expect(mockAuth.switchProfile).toHaveBeenCalledTimes(1);
  });

  it("goes straight to a customer profile that is already on", async () => {
    emptyCustomerHome();
    mockAuth.profile.mockResolvedValue({ id: "u1", name: "Ravi Kumar", provider: "LOCAL", role: "PAINTER", switchTo: "CUSTOMER", customerProfileEnabled: true });
    mockAuth.switchProfile.mockImplementation(async () => {
      mockAuth.profile.mockResolvedValue({ id: "p1", name: "Ravi Kumar", provider: "LOCAL", role: "CUSTOMER", linkedProfile: true, switchTo: "PAINTER" });
      return { accessToken: "access-p", refreshToken: "refresh-p" };
    });
    renderRouter("./app", { initialUrl: "/painter/profile" });
    await waitFor(() => expect(screen.getByText(/Your own rooms are on your customer profile/)).toBeTruthy());

    fireEvent.press(screen.getByTestId("painter-own-home"));

    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAuth.setCustomerProfile).not.toHaveBeenCalled();
  });

  it("sets up a painter account that has no profile behind it, in one tap", async () => {
    mockPainter.profile.mockRejectedValue(new ApiError("http", 404, "No painter profile."));
    mockPainter.becomePainter.mockResolvedValue(painter());
    renderRouter("./app", { initialUrl: "/painter/profile" });
    await waitFor(() => expect(screen.getByTestId("profile-missing")).toBeTruthy());
    fireEvent.press(screen.getByText("Set it up"));
    await waitFor(() => expect(screen.getByTestId("profile-areas")).toBeTruthy());
    expect(mockPainter.becomePainter).toHaveBeenCalledTimes(1);
  });
});

// ── C33 · Work as a painter ───────────────────────────────────────────────────

describe("C33 · Work as a painter", () => {
  it("makes the account a painter's after a plain confirm, and opens the painter's home", async () => {
    signedInAs("CUSTOMER");
    mockPainter.becomePainter.mockImplementation(async () => {
      mockAuth.profile.mockResolvedValue({ id: "u1", name: "Ravi Kumar", provider: "LOCAL", role: "PAINTER", phoneNumber: "+919876543210" });
      return painter();
    });
    renderRouter("./app", { initialUrl: "/become-painter" });
    await waitFor(() => expect(screen.getByTestId("become-painter")).toBeTruthy());
    expect(screen.getByText(/for good/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("become-painter"));
    await waitFor(() => expect(screen.getByText(/It stays a painter's account — it can't be changed back\./)).toBeTruthy());
    expect(mockPainter.becomePainter).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Make it a painter account"));
    await waitFor(() => expect(screen).toHavePathname("/painter"));
    expect(mockPainter.becomePainter).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal in its own words, and stays a customer", async () => {
    signedInAs("CUSTOMER");
    mockPainter.becomePainter.mockRejectedValue(new ApiError("http", 403, "This is a customer profile. Switch back to your own account to work as a painter."));
    renderRouter("./app", { initialUrl: "/become-painter" });
    await waitFor(() => expect(screen.getByTestId("become-painter")).toBeTruthy());
    fireEvent.press(screen.getByTestId("become-painter"));
    await waitFor(() => expect(screen.getByText("Make it a painter account")).toBeTruthy());
    fireEvent.press(screen.getByText("Make it a painter account"));
    await waitFor(() => expect(screen.getAllByText("This is a customer profile. Switch back to your own account to work as a painter.").length).toBeGreaterThan(0));
    await tick();
    expect(screen).toHavePathname("/become-painter");
  });
});
