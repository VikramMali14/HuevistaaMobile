/**
 * Phase 4 through the REAL route tree: the Boards tab, a room's board, the colour board
 * (choose, confirm, make), board ready, sharing a room, rooms and credits, checkout, the
 * payment result and the payment return. Only the network, the browser session, the
 * phone's files and share sheet, and the secure store are faked; the canvas is a stand-in
 * that is ready at once and photographs each option as a file name.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { ApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import type { CartCatalogue, ProjectCombo, RoomDetail, RoomRegion, UserProfile } from "@/api/types";
import { forgetRememberedRoute } from "@/auth/pending-route";
import { resetMadeBoards } from "@/features/boards/made-boards";
import { resetPayments } from "@/features/payments/payments";
import { resetPending, savePending } from "@/features/payments/pending-payment";
import { resetPaintStore, resetRecentShades } from "@/features/studio/paint-store";
import { resetTrays, saveCombo } from "@/features/studio/tray-store";
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
const mockOpenAuth = jest.fn();
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuth(...args),
  openBrowserAsync: jest.fn(async () => ({})),
}));
let mockOpeningUrl: string | null = null;
jest.mock("@/features/payments/use-opening-url", () => ({ useOpeningUrl: () => mockOpeningUrl }));
const mockCopy = jest.fn(async (_text: string) => true);
jest.mock("expo-clipboard", () => ({ setStringAsync: (text: string) => mockCopy(text) }));
jest.mock("@/features/studio/engine/texture-loader", () => ({
  loadTexture: jest.fn(async () => ({ pixels: { localUri: "file://x" }, width: 800, height: 600 })),
  loadBundledTexture: jest.fn(async () => ({ pixels: { localUri: "file://x" }, width: 800, height: 600 })),
  clearStudioCache: jest.fn(),
}));

// The canvas: ready at once; a snapshot names the colours it was asked to paint.
const mockSnapshot = jest.fn(async (only?: ReadonlyMap<string, { hex: string }>) =>
  only ? `file://snap-${[...only.values()].map((p) => p.hex.slice(1)).join("-")}.jpg` : "file://snap.jpg",
);
jest.mock("@/features/studio/engine/RoomCanvas", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { forwardRef, useEffect, useImperativeHandle } = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    fitRect: () => ({ width: 100, height: 75, left: 0, top: 0 }),
    RoomCanvas: forwardRef(function RoomCanvas(props: { onState?: (s: unknown) => void; testID?: string }, ref: unknown) {
      useImperativeHandle(ref, () => ({ snapshot: mockSnapshot, retry: () => {} }));
      const { onState } = props;
      useEffect(() => onState?.({ kind: "ready", width: 800, height: 600, missing: 0 }), [onState]);
      return <View testID={props.testID} />;
    }),
  };
});

// The phone's files and share sheet.
const mockFiles = {
  readSnapshot: jest.fn(async (uri: string) => new Uint8Array([uri.length])),
  writeBoard: jest.fn(async (roomId: string, _name: string, _pdf: Uint8Array, pictures: readonly (Uint8Array | null)[]) => ({
    folder: `file://boards/${roomId}/1`,
    file: `file://boards/${roomId}/1/board.pdf`,
    pages: pictures.map((p, i) => (p ? `file://boards/${roomId}/1/page-${i + 1}.jpg` : null)),
  })),
  keepOnly: jest.fn(),
  discardBoard: jest.fn(),
  discardRoomBoards: jest.fn(),
  boardExists: jest.fn(() => true),
  shareBoard: jest.fn(async () => undefined),
  saveBoardToPhone: jest.fn(async () => true),
  clearBoardFiles: jest.fn(),
};
jest.mock("@/features/boards/board-files", () => ({
  get readSnapshot() {
    return mockFiles.readSnapshot;
  },
  get writeBoard() {
    return mockFiles.writeBoard;
  },
  get keepOnly() {
    return mockFiles.keepOnly;
  },
  get discardBoard() {
    return mockFiles.discardBoard;
  },
  get discardRoomBoards() {
    return mockFiles.discardRoomBoards;
  },
  get boardExists() {
    return mockFiles.boardExists;
  },
  get shareBoard() {
    return mockFiles.shareBoard;
  },
  get saveBoardToPhone() {
    return mockFiles.saveBoardToPhone;
  },
  get clearBoardFiles() {
    return mockFiles.clearBoardFiles;
  },
}));

const mockAuth = { profile: jest.fn<Promise<UserProfile>, []>(), logout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));

const mockMe = {
  entitlement: jest.fn(),
  projectOptions: jest.fn(),
  aiCredits: jest.fn(),
  projects: jest.fn(),
  renders: jest.fn(),
  renderableProjects: jest.fn(),
  requestMoreRooms: jest.fn(),
  redeemCode: jest.fn(),
  assignedProducts: jest.fn(),
  shopCombos: jest.fn(),
};
jest.mock("@/api/endpoints/me", () => ({ meApi: mockMe }));
const mockShades = { mine: jest.fn(), myBrands: jest.fn(), detail: jest.fn(), scheme: jest.fn() };
jest.mock("@/api/endpoints/shades", () => ({ shadesApi: mockShades }));
const mockLibrary = { list: jest.fn(), get: jest.fn(), start: jest.fn() };
jest.mock("@/api/endpoints/library", () => ({ libraryApi: mockLibrary }));
const mockProjects = {
  get: jest.fn<Promise<RoomDetail>, [string]>(),
  saveColours: jest.fn(),
  latestReport: jest.fn(),
  maskPath: (id: string, regionId: number) => `/api/projects/${id}/regions/${regionId}/mask`,
  rewardCode: jest.fn(),
  recordBoard: jest.fn(),
  combos: jest.fn<Promise<ProjectCombo[]>, [string]>(),
  share: jest.fn(),
  unshare: jest.fn(),
};
jest.mock("@/api/endpoints/projects", () => ({
  get projectsApi() {
    return mockProjects;
  },
}));
const mockBilling = {
  cart: jest.fn<Promise<CartCatalogue>, []>(),
  cartOrder: jest.fn(),
  verifyCart: jest.fn(),
  pdfAllowance: jest.fn(),
  reportCheckout: jest.fn(async () => undefined),
};
jest.mock("@/api/endpoints/billing", () => ({
  get billingApi() {
    return mockBilling;
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function signedIn(extra: Partial<UserProfile> = {}) {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Priya Sharma", provider: "LOCAL", role: "CUSTOMER", phoneNumber: "+919876543210", ...extra });
}
const region = (id: number, category: RoomRegion["category"], label = ""): RoomRegion => ({
  id,
  label,
  category,
  maskUrl: `https://bucket.s3/masks/${id}.png?sig=abc`,
  manual: false,
  inPlan: true,
});
const room = (extra: Partial<RoomDetail> = {}): RoomDetail => ({
  id: "p1",
  name: "Living room",
  status: "SEGMENTED",
  imageId: "i1",
  imageUrl: "/api/images/files/p1.jpg",
  cleanedImageUrl: "/api/images/files/p1-clean.jpg",
  regions: [region(11, "MAIN_WALL"), region(12, "ACCENT_WALL"), region(13, "TRIM")],
  boardsUsed: 0,
  boardsAllowed: 1,
  ...extra,
});
const combo = (id: string, boardIndex: number, pageIndex: number, shades: ProjectCombo["shades"]): ProjectCombo => ({
  id,
  boardIndex,
  pageIndex,
  rendered: false,
  shades,
});
const CART: CartCatalogue = {
  eligible: true,
  projectPricePaise: 14900,
  creditPricePaise: 7000,
  comboPricePaise: 19900,
  comboProjects: 1,
  comboCredits: 1,
  bundleAvailable: true,
  bundlePricePaise: 43800,
  bundleListPricePaise: 65700,
  bundleProjects: 3,
  bundleCredits: 3,
  validDays: 365,
  maxQuantity: 20,
  offers: [],
  offersApplyToPackages: false,
  availableProjects: 0,
  creditBalance: 0,
  currency: "INR",
};
const wallet = (extra: object = {}) => ({
  balance: 4,
  eligible: true,
  pricePaise: 7000,
  listPricePaise: 9900,
  discountPercent: 29,
  minPurchase: 1,
  maxPurchase: 20,
  renderCost: 1,
  currency: "INR",
  recentActivity: [
    { id: "a1", credits: 5, type: "PURCHASED", balanceAfter: 5, createdAt: "2026-10-01T10:00:00" },
    { id: "a2", credits: -1, type: "SPENT_ON_RENDER", balanceAfter: 4, note: null, createdAt: "2026-10-02T10:00:00" },
  ],
  ...extra,
});
const shade = (code: string, hex: string): BackendShade => ({ shadeCode: code, hvCode: code, hexCode: hex, shadeFamily: "Greens", lrv: 40, brandName: "Asian Paints", brandSlug: "asian-paints" });
const SIG = "c".repeat(64);
const ORDER = {
  orderId: "order_ABC123xyz",
  subtotalPaise: 14900,
  discountPercent: 0,
  discountPaise: 0,
  amountPaise: 14900,
  projectsGranted: 1,
  creditsGranted: 0,
  validDays: 365,
  currency: "INR",
  razorpayKeyId: "rzp_test_123456",
};
const paidUrl = `huevista://pay/callback#status=success&order_id=${ORDER.orderId}&payment_id=pay_DEF456uvw&signature=${SIG}`;

const press = (text: string | RegExp) => fireEvent.press(screen.getByText(text));
const pressLast = (text: string | RegExp) => {
  const all = screen.getAllByText(text);
  fireEvent.press(all[all.length - 1]!);
};

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  for (const group of [mockAuth, mockMe, mockShades, mockLibrary, mockProjects, mockBilling, mockFiles]) {
    for (const fn of Object.values(group)) if (jest.isMockFunction(fn)) fn.mockClear();
  }
  for (const fn of [...Object.values(mockMe), ...Object.values(mockProjects), mockBilling.cart, mockBilling.cartOrder, mockBilling.verifyCart, mockBilling.pdfAllowance]) {
    if (jest.isMockFunction(fn)) fn.mockReset();
  }
  mockOpenAuth.mockReset();
  mockSnapshot.mockClear();
  mockCopy.mockClear();
  mockAuth.logout.mockResolvedValue(undefined);
  mockMe.entitlement.mockResolvedValue(null);
  mockMe.projectOptions.mockResolvedValue({ subscribed: false, projectPricePoints: 0, projectPricePaise: 14900, pointsBalance: 0, validDays: 365, availableCredits: 1 });
  mockMe.aiCredits.mockResolvedValue(wallet());
  mockMe.projects.mockResolvedValue([]);
  mockMe.renders.mockResolvedValue([]);
  mockMe.renderableProjects.mockResolvedValue([]);
  mockMe.shopCombos.mockResolvedValue([]);
  mockMe.assignedProducts.mockResolvedValue({ shops: [] });
  mockLibrary.list.mockResolvedValue([]);
  mockShades.mine.mockResolvedValue([shade("HV0118", "#7b8a72"), shade("HV0124", "#3e4a52")]);
  mockShades.myBrands.mockResolvedValue([{ name: "Asian Paints", slug: "asian-paints", shadeCount: 2 }]);
  mockShades.scheme.mockResolvedValue({ showBrands: false, showNames: false, showRealCodes: false });
  mockProjects.get.mockResolvedValue(room());
  mockProjects.latestReport.mockResolvedValue(null);
  mockProjects.saveColours.mockResolvedValue(undefined);
  mockProjects.rewardCode.mockResolvedValue({ token: "t1", scanUrl: "https://huevistaa.com/r/t1", expiresAt: "2026-12-01T00:00:00", paysPoints: true });
  mockProjects.combos.mockResolvedValue([]);
  mockBilling.cart.mockResolvedValue(CART);
  mockBilling.pdfAllowance.mockResolvedValue({ imagesPerPdf: 5, monthlyLimit: 0, used: 0, remaining: 0, unlimited: true });
  mockFiles.boardExists.mockReturnValue(true);
  resetPaintStore();
  resetTrays();
  resetPayments();
  resetPending();
  await resetMadeBoards();
  await resetRecentShades();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } });
  forgetRememberedRoute();
  await AsyncStorage.clear();
});

// ── C4 Boards ─────────────────────────────────────────────────────────────────

describe("C4 · Boards", () => {
  it("lists the rooms that took a board, finished first, and opens one", async () => {
    signedIn();
    mockMe.renderableProjects.mockResolvedValue([
      { id: "p2", name: "Reopened room", imageUrl: "/a.jpg", closedAt: null, comboCount: 1 },
      { id: "p1", name: "Living room", imageUrl: "/b.jpg", closedAt: "2026-10-01T10:00:00", comboCount: 3 },
    ]);
    renderRouter("./app", { initialUrl: "/boards" });
    await waitFor(() => expect(screen.getByText("Living room")).toBeTruthy());
    expect(screen.getByText("Taken 1 Oct 2026")).toBeTruthy();
    expect(screen.getByText("3 options")).toBeTruthy();
    expect(screen.getByText("Still open")).toBeTruthy();
    expect(screen.getByText("1 option")).toBeTruthy();
    press("Living room");
    await waitFor(() => expect(screen).toHavePathname("/board/p1"));
  });

  it("says what each half will hold when it is empty", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/boards" });
    await waitFor(() => expect(screen.getByText("No colour boards yet")).toBeTruthy());
    expect(screen.getByText("Take a colour board from any room and it appears here.")).toBeTruthy();
    press("AI images");
    await waitFor(() => expect(screen.getByText("No AI images yet")).toBeTruthy());
    press("Make an AI image");
    await waitFor(() => expect(screen).toHavePathname("/ai-image/new"));
  });

  it("shows finished AI images and opens one", async () => {
    signedIn();
    mockMe.renders.mockResolvedValue([
      { id: "r1", projectId: "p1", projectName: "Living room", status: "READY", imageUrl: "https://x/r1.jpg", completedAt: "2026-10-03T10:00:00" },
      { id: "r2", projectId: "p1", projectName: "Kitchen", status: "FAILED" },
    ]);
    renderRouter("./app", { initialUrl: "/boards" });
    await waitFor(() => expect(screen.getByText("AI images")).toBeTruthy());
    press("AI images");
    await waitFor(() => expect(screen.getByLabelText("AI image of Living room")).toBeTruthy());
    expect(screen.queryByText("Kitchen")).toBeNull();
    fireEvent.press(screen.getByLabelText("AI image of Living room"));
    await waitFor(() => expect(screen).toHavePathname("/ai-image/r1"));
  });
});

// ── C25 Board detail, and where a finished room opens ─────────────────────────

describe("C25 · Board detail", () => {
  it("a finished room opens on its board, with every option's codes", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ closedAt: "2026-10-01T10:00:00", boardsUsed: 1 }));
    mockProjects.combos.mockResolvedValue([
      combo("c2", 1, 1, [{ regionId: 11, regionLabel: "Main wall", shadeCode: "HV0124", hvCode: "HV0124", hex: "#3e4a52" }]),
      combo("c1", 1, 0, [
        { regionId: 11, regionLabel: "Main wall", shadeCode: "HV0118", hvCode: "HV0118", hex: "#7b8a72" },
        { regionId: 13, regionLabel: "Trim", shadeCode: "HV0001", hvCode: "HV0001", hex: "#ffffff" },
      ]),
    ]);
    renderRouter("./app", { initialUrl: "/room/p1" });
    await waitFor(() => expect(screen).toHavePathname("/board/p1"));
    await waitFor(() => expect(screen.getByText("Option 1")).toBeTruthy());
    expect(screen.getByText("Board taken 1 Oct 2026")).toBeTruthy();
    expect(screen.getByText("HV0118")).toBeTruthy();
    expect(screen.getByText("HV0124")).toBeTruthy();
    expect(screen.getByText("Read these codes out at the counter — any HueVistaa shop can look them up.")).toBeTruthy();
    // In the order they were printed.
    expect(screen.getByTestId("board-combo-c1")).toBeTruthy();
    fireEvent.press(screen.getAllByText("Make an AI image of this option")[0]!);
    await waitFor(() => expect(screen).toHavePathname("/ai-image/options"));
  });

  it("a room finished without a board says so, and offers to look at it", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ closedAt: "2026-10-01T10:00:00" }));
    renderRouter("./app", { initialUrl: "/board/p1" });
    await waitFor(() => expect(screen.getByText("No options on this room's board")).toBeTruthy());
    press("See the room");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/paint"));
  });
});

// ── C15 Colour board ──────────────────────────────────────────────────────────

describe("C15 · Colour board", () => {
  const twoSaved = () => {
    saveCombo("p1", { "11": { hex: "#7b8a72", code: "HV0118", lrv: 40 }, "13": { hex: "#ffffff", code: "HV0001" } }, ["11", "12", "13"]);
    saveCombo("p1", { "11": { hex: "#3e4a52", code: "HV0124", lrv: 10 } }, ["11", "12", "13"]);
  };

  it("with nothing saved, sends the person back to Paint to save some", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByText("Nothing saved yet")).toBeTruthy());
    press("Back to painting");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/paint"));
  });

  it("states plainly what the board will be, then makes it in the money rule's order", async () => {
    signedIn();
    twoSaved();
    mockProjects.recordBoard.mockResolvedValue({ allowance: {}, boardsUsed: 1, boardsAllowed: 1, closed: true });
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByText("Option 2")).toBeTruthy());
    expect(screen.getByText("HV0118")).toBeTruthy();
    expect(screen.getAllByText("Main wall")).toHaveLength(2);
    expect(screen.getByText("One colour board on this room, up to 5 options.")).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId("board-make")).toBeEnabled());
    fireEvent.press(screen.getByTestId("board-make"));
    await waitFor(() => expect(screen.getByText("Make your colour board?")).toBeTruthy());
    expect(screen.getByText(/Your board will have 2 options on 3 pages\./)).toBeTruthy();
    expect(screen.getByText(/This is this room's only board\./)).toBeTruthy();
    expect(screen.getByText(/Taking it closes the room\./)).toBeTruthy();
    press("Make the board");

    await waitFor(() => expect(screen).toHavePathname("/room/p1/board-done"));
    // Reward code → each option photographed → file written → charged (recording each page).
    expect(mockProjects.rewardCode).toHaveBeenCalledWith("p1");
    expect(mockSnapshot).toHaveBeenCalledTimes(2);
    expect([...mockSnapshot.mock.calls[0]![0]!.keys()]).toEqual(["11", "13"]);
    expect(mockFiles.writeBoard.mock.invocationCallOrder[0]).toBeLessThan(mockProjects.recordBoard.mock.invocationCallOrder[0]!);
    expect(mockProjects.recordBoard).toHaveBeenCalledWith("p1", [
      {
        shades: [
          { regionId: 11, regionLabel: "Main wall", shadeCode: "HV0118", shadeName: null, hex: "#7b8a72" },
          { regionId: 13, regionLabel: "Trim & frames", shadeCode: "HV0001", shadeName: null, hex: "#ffffff" },
        ],
      },
      { shades: [{ regionId: 11, regionLabel: "Main wall", shadeCode: "HV0124", shadeName: null, hex: "#3e4a52" }] },
    ]);
    // The PDF itself is a real one.
    const pdf = mockFiles.writeBoard.mock.calls[0]![2];
    expect(String.fromCharCode(...pdf.slice(0, 8))).toBe("%PDF-1.4");
    expect(mockFiles.keepOnly).toHaveBeenCalled();

    // C16: the pages, and sending it on.
    await waitFor(() => expect(screen.getByText("Your board is ready")).toBeTruthy());
    expect(screen.getByText("2 options on 3 pages, kept on this phone.")).toBeTruthy();
    expect(screen.getByText("This room is finished now — you can still look at it, but not change its colours.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("board-send"));
    await waitFor(() => expect(mockFiles.shareBoard).toHaveBeenCalledWith("file://boards/p1/1/board.pdf", "Your colour board · Living room"));
    fireEvent.press(screen.getByTestId("board-save"));
    await waitFor(() => expect(screen.getByText("Board saved.")).toBeTruthy());
    // The tray is spent.
    expect(JSON.parse((await AsyncStorage.getItem("hv.boardTrays")) ?? "{}")).toEqual({});
  });

  it("puts options in order and takes one off", async () => {
    signedIn();
    twoSaved();
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByText("Option 2")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Move option 2 up"));
    // The darker grey is first now.
    await waitFor(() => expect(screen.getByTestId("board-option-1")).toHaveTextContent(/HV0124/));
    fireEvent.press(screen.getByTestId("board-remove-2"));
    await waitFor(() => expect(screen.queryByText("Option 2")).toBeNull());
    expect(screen.getByText("Option taken off the board.")).toBeTruthy();
  });

  it("obeys a refusal: nothing handed over, the server's sentence shown", async () => {
    signedIn();
    twoSaved();
    mockProjects.recordBoard.mockRejectedValue(new ApiError("http", 409, "This room has already handed over all 1 of its colour board."));
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByTestId("board-make")).toBeEnabled());
    fireEvent.press(screen.getByTestId("board-make"));
    await waitFor(() => expect(screen.getByText("Make the board")).toBeTruthy());
    press("Make the board");
    await waitFor(() => expect(screen.getByText("This room has already handed over all 1 of its colour board.")).toBeTruthy());
    expect(screen).toHavePathname("/room/p1/board");
    expect(mockFiles.discardBoard).toHaveBeenCalled();
    expect(mockFiles.keepOnly).not.toHaveBeenCalled();
  });

  it("hands the board over anyway when the charge goes unanswered", async () => {
    signedIn();
    twoSaved();
    mockProjects.recordBoard.mockRejectedValue(new ApiError("network", 0, "Network error"));
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByTestId("board-make")).toBeEnabled());
    fireEvent.press(screen.getByTestId("board-make"));
    await waitFor(() => expect(screen.getByText("Make the board")).toBeTruthy());
    press("Make the board");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/board-done"));
  });

  it("charges nothing when the board can't be made on the phone", async () => {
    signedIn();
    twoSaved();
    mockFiles.writeBoard.mockRejectedValueOnce(new Error("disk full"));
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByTestId("board-make")).toBeEnabled());
    fireEvent.press(screen.getByTestId("board-make"));
    await waitFor(() => expect(screen.getByText("Make the board")).toBeTruthy());
    press("Make the board");
    await waitFor(() => expect(screen.getByTestId("board-problem")).toBeTruthy());
    expect(screen.getByText(/Nothing was charged/)).toBeTruthy();
    expect(mockProjects.recordBoard).not.toHaveBeenCalled();
  });

  it("a finished room's board can't be taken again, and says where its board is", async () => {
    signedIn();
    twoSaved();
    mockProjects.get.mockResolvedValue(room({ closedAt: "2026-10-01T10:00:00", boardsUsed: 1 }));
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByTestId("board-blocked")).toBeTruthy());
    expect(screen.queryByTestId("board-make")).toBeNull();
    press("See the board");
    await waitFor(() => expect(screen).toHavePathname("/board/p1"));
  });

  it("asks for options to come off when there are more than a board carries", async () => {
    signedIn();
    mockBilling.pdfAllowance.mockResolvedValue({ imagesPerPdf: 1, monthlyLimit: 0, used: 0, remaining: 0, unlimited: true });
    twoSaved();
    renderRouter("./app", { initialUrl: "/room/p1/board" });
    await waitFor(() => expect(screen.getByText("A board carries up to 1 options — take 1 off to make it.")).toBeTruthy());
    expect(screen.getByTestId("board-make")).toBeDisabled();
  });
});

describe("C16 · Board ready", () => {
  it("opened without a board on this phone, points to the room's options", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/board-done" });
    await waitFor(() => expect(screen.getByText("This board isn't on this phone")).toBeTruthy());
    press("See the board's options");
    await waitFor(() => expect(screen).toHavePathname("/board/p1"));
  });
});

// ── C17 Share this room ───────────────────────────────────────────────────────

describe("C17 · Share this room", () => {
  it("makes a link for so many days and chosen companies, then offers it", async () => {
    signedIn();
    mockShades.myBrands.mockResolvedValue([
      { name: "Asian Paints", slug: "asian-paints", shadeCount: 2 },
      { name: "Berger", slug: "berger", shadeCount: 2 },
    ]);
    mockProjects.share.mockResolvedValue({ shareUrl: "https://huevistaa.com/share/tok123", shareToken: "tok123", expiresAt: "2026-10-12T10:00:00" });
    renderRouter("./app", { initialUrl: "/room/p1/share" });
    await waitFor(() => expect(screen.getByText("Berger")).toBeTruthy());
    press("7 days");
    press("Berger");
    fireEvent.press(screen.getByTestId("share-make"));
    await waitFor(() => expect(screen.getByTestId("share-url")).toHaveTextContent("https://huevistaa.com/share/tok123"));
    expect(mockProjects.share).toHaveBeenCalledWith("p1", 7, ["Berger"]);
    expect(screen.getByText("Works until 12 Oct 2026. Sharing again keeps the same link.")).toBeTruthy();
    press("Copy link");
    await waitFor(() => expect(mockCopy).toHaveBeenCalledWith("https://huevistaa.com/share/tok123"));
  });

  it("shows a live link, and stops it after asking", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ hasShareLink: true, shareToken: "live456", shareExpiresAt: "2026-10-09T10:00:00" }));
    mockProjects.unshare.mockResolvedValue(undefined);
    renderRouter("./app", { initialUrl: "/room/p1/share" });
    await waitFor(() => expect(screen.getByTestId("share-url")).toHaveTextContent("https://huevistaa.com/share/live456"));
    fireEvent.press(screen.getByTestId("share-stop"));
    await waitFor(() => expect(screen.getByText("Stop sharing this room?")).toBeTruthy());
    pressLast("Stop sharing");
    await waitFor(() => expect(mockProjects.unshare).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(screen.getByTestId("share-make")).toBeTruthy());
  });

  it("says the server's reason when the room can't be shared", async () => {
    signedIn();
    mockProjects.share.mockRejectedValue(new ApiError("http", 403, "This room is view only, so it can't be shared."));
    renderRouter("./app", { initialUrl: "/room/p1/share" });
    await waitFor(() => expect(screen.getByTestId("share-make")).toBeTruthy());
    fireEvent.press(screen.getByTestId("share-make"));
    await waitFor(() => expect(screen.getByTestId("share-error")).toHaveTextContent(/This room is view only, so it can't be shared\./));
  });
});

// ── C27 Rooms and credits ─────────────────────────────────────────────────────

describe("C27 · Rooms and credits", () => {
  it("a shop's customer with no rooms left asks the shop — and is never sold one", async () => {
    signedIn();
    mockMe.entitlement.mockResolvedValue({ customerId: "u1", customerName: "Priya", projectAllowance: 2, projectsCreated: 2, projectsRemaining: 0 });
    mockMe.projectOptions.mockResolvedValue({ subscribed: false, projectPricePoints: 0, projectPricePaise: 14900, pointsBalance: 0, validDays: 30, availableCredits: 0 });
    mockMe.assignedProducts.mockResolvedValue({ shops: [{ shopId: "s1", shopName: "Sharma Paints", products: [] }] });
    mockMe.requestMoreRooms.mockResolvedValue(undefined);
    renderRouter("./app", { initialUrl: "/balance" });
    await waitFor(() => expect(screen.getByTestId("balance-ask")).toBeTruthy());
    expect(screen.getByTestId("balance-rooms-n")).toHaveTextContent("0");
    expect(screen.queryByTestId("balance-buy-rooms")).toBeNull();
    fireEvent.press(screen.getByTestId("balance-ask"));
    await waitFor(() => expect(screen.getByText("We've asked Sharma Paints. They can add a room from their counter.")).toBeTruthy());
  });

  it("anyone else buys rooms and credits, and sees the credit statement", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/balance" });
    await waitFor(() => expect(screen.getByTestId("balance-credits-n")).toHaveTextContent("4"));
    expect(screen.getByTestId("balance-rooms-n")).toHaveTextContent("1");
    expect(screen.getByText("A room stays open for a year once you start it.")).toBeTruthy();
    expect(screen.getByText("₹70 a credit, down from ₹99")).toBeTruthy();
    expect(screen.getByText("Credits bought")).toBeTruthy();
    expect(screen.getByText("1 AI image")).toBeTruthy();
    expect(screen.getByText("4 left")).toBeTruthy();
    fireEvent.press(screen.getByTestId("balance-buy-credits"));
    await waitFor(() => expect(screen).toHavePathname("/checkout"));
  });

  it("a balance that won't load is said so — never 0 rooms", async () => {
    signedIn();
    mockMe.entitlement.mockRejectedValue(new ApiError("network", 0, "Network error"));
    mockMe.projectOptions.mockRejectedValue(new ApiError("network", 0, "Network error"));
    mockMe.aiCredits.mockRejectedValue(new ApiError("network", 0, "Network error"));
    renderRouter("./app", { initialUrl: "/balance" });
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    expect(screen.queryByTestId("balance-rooms-n")).toBeNull();
  });
});

// ── C28 Checkout → C29 Payment result ─────────────────────────────────────────

describe("C28 · Checkout", () => {
  it("prices the basket as the server does, packing it the cheapest way", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/checkout" });
    await waitFor(() => expect(screen.getByText("Pay ₹149")).toBeTruthy());
    fireEvent.press(screen.getByTestId("stepper-images-more"));
    // One room and one image is the combo: ₹199, not ₹219.
    await waitFor(() => expect(screen.getByTestId("checkout-total")).toHaveTextContent("₹199"));
    expect(screen.getByText("Bundled as the offer")).toBeTruthy();
    fireEvent.press(screen.getByTestId("checkout-offer"));
    await waitFor(() => expect(screen.getByTestId("checkout-total")).toHaveTextContent("₹438"));
    expect(screen.getByText("Pay ₹438")).toBeTruthy();
  });

  it("pays, verifies and shows what was added", async () => {
    signedIn();
    mockBilling.cartOrder.mockResolvedValue(ORDER);
    mockBilling.verifyCart.mockResolvedValue(CART);
    mockOpenAuth.mockResolvedValue({ type: "success", url: paidUrl });
    renderRouter("./app", { initialUrl: "/checkout?rooms=1" });
    await waitFor(() => expect(screen.getByText("Pay ₹149")).toBeTruthy());
    fireEvent.press(screen.getByTestId("checkout-pay"));
    await waitFor(() => expect(screen.getByTestId("payment-paid")).toBeTruthy());
    expect(mockBilling.cartOrder).toHaveBeenCalledWith({ projects: 1, credits: 0, combos: 0, bundles: 0 });
    expect(mockOpenAuth.mock.calls[0]![0]).toContain("contact=%2B919876543210");
    expect(screen.getByText("1 room added.")).toBeTruthy();
    press("Start a room");
    await waitFor(() => expect(screen).toHavePathname("/room/new"));
  });

  it("a cancelled payment says only that, and stays on the basket", async () => {
    signedIn();
    mockBilling.cartOrder.mockResolvedValue(ORDER);
    mockOpenAuth.mockResolvedValue({ type: "success", url: "huevista://pay/callback#status=cancelled" });
    renderRouter("./app", { initialUrl: "/checkout" });
    await waitFor(() => expect(screen.getByText("Pay ₹149")).toBeTruthy());
    fireEvent.press(screen.getByTestId("checkout-pay"));
    await waitFor(() => expect(screen.getByText("Payment cancelled.")).toBeTruthy());
    expect(screen).toHavePathname("/checkout");
  });

  it("a refused payment gives the bank's reason and Try again on the same basket", async () => {
    signedIn();
    mockBilling.cartOrder.mockResolvedValue(ORDER);
    mockOpenAuth.mockResolvedValue({ type: "success", url: "huevista://pay/callback#status=failed&code=BAD_REQUEST_ERROR&description=Your+card+was+declined." });
    renderRouter("./app", { initialUrl: "/checkout" });
    await waitFor(() => expect(screen.getByText("Pay ₹149")).toBeTruthy());
    fireEvent.press(screen.getByTestId("checkout-pay"));
    await waitFor(() => expect(screen.getByText("Your card was declined.")).toBeTruthy());
    fireEvent.press(screen.getByTestId("payment-retry"));
    await waitFor(() => expect(screen).toHavePathname("/checkout"));
  });

  it("paid but not confirmed: checking, never failed — then confirmed on Check again", async () => {
    signedIn();
    mockBilling.cartOrder.mockResolvedValue(ORDER);
    mockBilling.verifyCart.mockRejectedValueOnce(new ApiError("network", 0, "Network error"));
    mockOpenAuth.mockResolvedValue({ type: "success", url: paidUrl });
    renderRouter("./app", { initialUrl: "/checkout" });
    await waitFor(() => expect(screen.getByText("Pay ₹149")).toBeTruthy());
    fireEvent.press(screen.getByTestId("checkout-pay"));
    await waitFor(() => expect(screen.getByText("We're checking your payment")).toBeTruthy());
    expect(screen.getByText("Payment reference pay_DEF456uvw")).toBeTruthy();
    expect(screen.queryByText(/didn't go through/)).toBeNull();
    mockBilling.verifyCart.mockResolvedValue(CART);
    fireEvent.press(screen.getByTestId("payment-check"));
    await waitFor(() => expect(screen.getByTestId("payment-paid")).toBeTruthy());
  });

  it("a payment still being confirmed blocks paying again", async () => {
    signedIn();
    savePending({ accountId: "u1", orderId: ORDER.orderId, amountPaise: 14900, rooms: 1, credits: 0, startedAt: Date.now(), paid: { paymentId: "pay_DEF456uvw", signature: SIG } });
    renderRouter("./app", { initialUrl: "/checkout" });
    await waitFor(() => expect(screen.getByTestId("checkout-stuck")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("checkout-pay")).toBeDisabled());
  });

  it("a shop's customer buys AI images only", async () => {
    signedIn();
    mockMe.entitlement.mockResolvedValue({ customerId: "u1", customerName: "Priya", projectAllowance: 2, projectsCreated: 2, projectsRemaining: 0 });
    renderRouter("./app", { initialUrl: "/checkout?credits=1" });
    await waitFor(() => expect(screen.getByText("Your shop adds your rooms — ask them from Rooms and credits.")).toBeTruthy());
    expect(screen.queryByTestId("stepper-rooms")).toBeNull();
    await waitFor(() => expect(screen.getByText("Pay ₹70")).toBeTruthy());
  });
});

// ── D3 Payment return ─────────────────────────────────────────────────────────

describe("D3 · Payment return", () => {
  afterEach(() => {
    mockOpeningUrl = null;
  });

  it("on a cold start, finds the order kept on the phone, verifies it and shows the result", async () => {
    signedIn();
    savePending({ accountId: "u1", orderId: ORDER.orderId, amountPaise: 14900, rooms: 1, credits: 0, startedAt: Date.now() });
    mockBilling.verifyCart.mockResolvedValue(CART);
    mockOpeningUrl = paidUrl;
    renderRouter("./app", { initialUrl: "/pay/callback" });
    await waitFor(() => expect(screen.getByTestId("payment-paid")).toBeTruthy());
    expect(mockBilling.verifyCart).toHaveBeenCalledWith({ orderId: ORDER.orderId, paymentId: "pay_DEF456uvw", signature: SIG });
    expect(screen.getByText("1 room added.")).toBeTruthy();
  });

  it("a cancellation on a cold start goes back to the basket", async () => {
    signedIn();
    savePending({ accountId: "u1", orderId: ORDER.orderId, amountPaise: 14900, rooms: 1, credits: 0, startedAt: Date.now() });
    mockOpeningUrl = "huevista://pay/callback#status=cancelled";
    renderRouter("./app", { initialUrl: "/pay/callback" });
    await waitFor(() => expect(screen).toHavePathname("/checkout"));
    expect(mockBilling.reportCheckout).toHaveBeenCalledWith(ORDER.orderId, expect.objectContaining({ status: "ABANDONED" }));
  });

  it("signed out, keeps the proof and asks to sign in", async () => {
    savePending({ accountId: "u1", orderId: ORDER.orderId, amountPaise: 14900, rooms: 1, credits: 0, startedAt: Date.now() });
    mockOpeningUrl = paidUrl;
    renderRouter("./app", { initialUrl: "/pay/callback" });
    await waitFor(() => expect(screen.getByText("Sign in to finish your payment")).toBeTruthy());
    await act(async () => {});
    const kept = JSON.parse((await AsyncStorage.getItem("hv.pendingPayment")) ?? "null");
    expect(kept?.paid).toEqual({ paymentId: "pay_DEF456uvw", signature: SIG });
  });
});
