/**
 * Phase 5 through the REAL route tree: choosing the room and its option (C22), how it is
 * photographed and what it costs (C23), the wait and the image (C24), and the ways in and
 * out (C25, C4, C28 → C29). Only the network, the secure store and the phone's files,
 * photos and share sheet are faked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { ApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import type { AiCreditSummary, CartCatalogue, ProjectCombo, ProjectRender, RenderableProject, RoomDetail, UserProfile } from "@/api/types";
import { forgetRememberedRoute } from "@/auth/pending-route";
import { resetPayments, verifyPayment } from "@/features/payments/payments";
import { clearPending, savePending } from "@/features/payments/pending-payment";

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

/** A minimal but structurally valid JPEG (what the PDF needs to place the picture). */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x03, 0x00, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);

// The phone's files, photos and share sheet.
const mockFiles = {
  renderFile: jest.fn(async (_url: string, renderId: string) => `file://cache/ai-images/${renderId}.jpg`),
  renderBytes: jest.fn(async (_uri: string) => JPEG),
  saveRenderToPhotos: jest.fn(async (_uri: string): Promise<"saved" | "denied"> => "saved"),
  openPhotoSettings: jest.fn(),
  shareRender: jest.fn(async (_uri: string, _title: string) => undefined),
  sharePdf: jest.fn(async (_pdf: Uint8Array, _id: string, _room: string, _title: string) => undefined),
  clearRenderFiles: jest.fn(),
};
jest.mock("@/features/ai-images/render-files", () => ({
  get renderFile() {
    return mockFiles.renderFile;
  },
  get renderBytes() {
    return mockFiles.renderBytes;
  },
  get saveRenderToPhotos() {
    return mockFiles.saveRenderToPhotos;
  },
  get openPhotoSettings() {
    return mockFiles.openPhotoSettings;
  },
  get shareRender() {
    return mockFiles.shareRender;
  },
  get sharePdf() {
    return mockFiles.sharePdf;
  },
  get clearRenderFiles() {
    return mockFiles.clearRenderFiles;
  },
}));

const mockAuth = { profile: jest.fn<Promise<UserProfile>, []>(), logout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));
const mockMe = {
  entitlement: jest.fn(),
  projectOptions: jest.fn(),
  aiCredits: jest.fn<Promise<AiCreditSummary>, []>(),
  projects: jest.fn(),
  renders: jest.fn(),
  renderableProjects: jest.fn<Promise<RenderableProject[]>, []>(),
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
  latestReport: jest.fn(),
  combos: jest.fn<Promise<ProjectCombo[]>, [string]>(),
  renders: jest.fn<Promise<ProjectRender[]>, [string]>(),
  render: jest.fn<Promise<ProjectRender>, [string, string]>(),
  requestRender: jest.fn(),
};
jest.mock("@/api/endpoints/projects", () => ({
  get projectsApi() {
    return mockProjects;
  },
}));
const mockBilling = { cart: jest.fn<Promise<CartCatalogue>, []>(), cartOrder: jest.fn(), verifyCart: jest.fn(), pdfAllowance: jest.fn(), reportCheckout: jest.fn() };
jest.mock("@/api/endpoints/billing", () => ({
  get billingApi() {
    return mockBilling;
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function signedIn() {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Priya Sharma", provider: "LOCAL", role: "CUSTOMER", phoneNumber: "+919876543210" });
}
const room = (extra: Partial<RoomDetail> = {}): RoomDetail => ({
  id: "p1",
  name: "Living room",
  status: "SEGMENTED",
  imageId: "i1",
  imageUrl: "/api/images/files/p1.jpg",
  cleanedImageUrl: "/api/images/files/p1-clean.jpg",
  imageType: "INDOOR",
  regions: [],
  closedAt: "2026-10-01T10:00:00",
  ...extra,
});
const combo = (id: string, boardIndex: number, pageIndex: number, codes: string[]): ProjectCombo => ({
  id,
  boardIndex,
  pageIndex,
  rendered: false,
  shades: codes.map((code, i) => ({ regionId: 11 + i, regionLabel: i === 0 ? "Main wall" : "Trim", shadeCode: code, hvCode: code, hex: i === 0 ? "#7b8a72" : "#ffffff" })),
});
const CART: CartCatalogue = {
  eligible: true,
  projectPricePaise: 14900,
  creditPricePaise: 7000,
  comboPricePaise: 19900,
  comboProjects: 1,
  comboCredits: 1,
  bundleAvailable: false,
  bundlePricePaise: 0,
  bundleListPricePaise: 0,
  bundleProjects: 0,
  bundleCredits: 0,
  validDays: 365,
  maxQuantity: 20,
  offers: [],
  offersApplyToPackages: false,
  availableProjects: 0,
  creditBalance: 1,
  currency: "INR",
};
const wallet = (extra: Partial<AiCreditSummary> = {}): AiCreditSummary => ({
  balance: 4,
  eligible: true,
  pricePaise: 7000,
  listPricePaise: 7000,
  discountPercent: 0,
  minPurchase: 1,
  maxPurchase: 50,
  renderCost: 1,
  renderTiers: [
    { quality: "PREMIUM", credits: 1 },
    { quality: "LUXURY", credits: 2 },
  ],
  currency: "INR",
  recentActivity: [],
  ...extra,
});
const image = (extra: Partial<ProjectRender> = {}): ProjectRender => ({
  id: "r1",
  comboId: "c1",
  status: "QUEUED",
  imageUrl: null,
  failureReason: null,
  timeOfDay: "DAY",
  borderMode: "KEEP_ORIGINAL",
  lighting: "NATURAL",
  furnishing: "KEEP",
  style: "MODERN",
  quality: "PREMIUM",
  sourceImage: "CLEANED",
  note: null,
  createdAt: "2026-10-06T10:00:00",
  completedAt: null,
  ...extra,
});
/** A moment as the server writes it: India time, no zone. */
const ist = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19);

const ready = (extra: Partial<ProjectRender> = {}) =>
  image({ status: "READY", imageUrl: "https://bucket.s3/r1.jpg?sig=1", completedAt: "2026-10-06T10:01:00", ...extra });

const press = (text: string | RegExp) => fireEvent.press(screen.getByText(text));

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  for (const group of [mockAuth, mockMe, mockShades, mockLibrary, mockProjects, mockBilling, mockFiles]) {
    for (const fn of Object.values(group)) if (jest.isMockFunction(fn)) fn.mockReset();
  }
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
  mockShades.mine.mockResolvedValue([]);
  mockShades.myBrands.mockResolvedValue([]);
  mockShades.scheme.mockResolvedValue({ showBrands: false, showNames: false, showRealCodes: false });
  mockProjects.get.mockResolvedValue(room());
  mockProjects.latestReport.mockResolvedValue(null);
  mockProjects.combos.mockResolvedValue([combo("c1", 1, 0, ["HV0118", "HV0001"]), combo("c2", 1, 1, ["HV0124"])]);
  mockProjects.renders.mockResolvedValue([]);
  mockBilling.cart.mockResolvedValue(CART);
  mockFiles.renderFile.mockImplementation(async (_url: string, renderId: string) => `file://cache/ai-images/${renderId}.jpg`);
  mockFiles.renderBytes.mockResolvedValue(JPEG);
  mockFiles.saveRenderToPhotos.mockResolvedValue("saved");
  mockFiles.shareRender.mockResolvedValue(undefined);
  mockFiles.sharePdf.mockResolvedValue(undefined);
  resetPayments();
  clearPending();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } });
  forgetRememberedRoute();
  await AsyncStorage.clear();
});

// ── C22 ───────────────────────────────────────────────────────────────────────

describe("C22 · AI image — choose the room", () => {
  it("lists the rooms with a board in the server's order, finished or still open, then that room's options", async () => {
    signedIn();
    mockMe.renderableProjects.mockResolvedValue([
      { id: "p1", name: "Living room", imageUrl: "/a.jpg", cleanedImageUrl: "/a-clean.jpg", closedAt: "2026-10-01T10:00:00", comboCount: 2 },
      { id: "p2", name: "Bedroom", imageUrl: "/b.jpg", closedAt: null, comboCount: 1 },
    ]);
    renderRouter("./app", { initialUrl: "/ai-image/new" });
    await waitFor(() => expect(screen.getByLabelText("Living room, 2 options, Finished 1 Oct 2026")).toBeTruthy());
    expect(screen.getByText("Which room shall we photograph?")).toBeTruthy();
    expect(screen.getByLabelText("Bedroom, 1 option, Still open")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Living room, 2 options, Finished 1 Oct 2026"));
    // Each option's walls and codes are read out with it.
    await waitFor(() => expect(screen.getByLabelText("Option 2: Main wall HV0124")).toBeTruthy());
    expect(screen.getByText("Which option shall we photograph?")).toBeTruthy();
    expect(mockProjects.combos).toHaveBeenCalledWith("p1");
    fireEvent.press(screen.getByLabelText("Option 2: Main wall HV0124"));
    await waitFor(() => expect(screen).toHavePathname("/ai-image/options"));
    expect(screen).toHaveSearchParams({ projectId: "p1", comboId: "c2" });
  });

  it("with no rooms, says how to get one — and a list that won't load is not 'none'", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/ai-image/new" });
    await waitFor(() => expect(screen.getByText("No colour boards yet")).toBeTruthy());
    expect(screen.getByText("Take a colour board from a room first — the AI image is made from one of its options.")).toBeTruthy();
  });

  it("says a list that won't load didn't load, never that there are no rooms", async () => {
    signedIn();
    mockMe.renderableProjects.mockRejectedValue(new ApiError("network", 0, "Network error"));
    renderRouter("./app", { initialUrl: "/ai-image/new" });
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    expect(screen.queryByText("No colour boards yet")).toBeNull();
  });

  it("opened with a room that has one option, goes straight on to its choices", async () => {
    signedIn();
    mockProjects.combos.mockResolvedValue([combo("c1", 1, 0, ["HV0118"])]);
    renderRouter("./app", { initialUrl: "/ai-image/new?projectId=p1" });
    await waitFor(() => expect(screen).toHavePathname("/ai-image/options"));
    expect(screen).toHaveSearchParams({ projectId: "p1", comboId: "c1" });
  });

  it("marks an option with a finished image — not one whose image failed", async () => {
    signedIn();
    mockProjects.combos.mockResolvedValue([{ ...combo("c1", 1, 0, ["HV0118"]), rendered: true }, { ...combo("c2", 1, 1, ["HV0124"]), rendered: true }]);
    mockProjects.renders.mockResolvedValue([image({ id: "r2", comboId: "c2", status: "FAILED" }), ready({ id: "r1", comboId: "c1" })]);
    renderRouter("./app", { initialUrl: "/ai-image/new?projectId=p1" });
    await waitFor(() => expect(screen.getByText("AI image made")).toBeTruthy());
    expect(screen.getAllByText("AI image made")).toHaveLength(1);
    expect(screen.getByTestId("ai-option-c1")).toHaveTextContent(/AI image made/);
  });

  it("a room that isn't on the account says so", async () => {
    signedIn();
    mockProjects.combos.mockRejectedValue(new ApiError("http", 404, "Project not found: p9"));
    renderRouter("./app", { initialUrl: "/ai-image/new?projectId=p9" });
    await waitFor(() => expect(screen.getByText("This room isn't on your account any more.")).toBeTruthy());
    expect(screen.queryByText(/Project not found/)).toBeNull();
  });
});

// ── C23 ───────────────────────────────────────────────────────────────────────

describe("C23 · AI image — options", () => {
  const open = () => renderRouter("./app", { initialUrl: "/ai-image/options?projectId=p1&comboId=c1" });

  it("prices the quality from the wallet, then asks for the image with every choice — once — and waits on C24", async () => {
    signedIn();
    mockProjects.requestRender.mockResolvedValue(image());
    mockProjects.render.mockResolvedValue(image());
    open();
    await waitFor(() => expect(screen.getByTestId("ai-cost")).toHaveTextContent("This image uses 1 AI credit. You have 4 AI credits."));
    expect(screen.getByText("Premium · 1 AI credit")).toBeTruthy();
    expect(screen.getByTestId("ai-chosen-option")).toHaveTextContent(/HV0118/);

    fireEvent.press(screen.getByTestId("ai-choice-LUXURY"));
    expect(screen.getByTestId("ai-cost")).toHaveTextContent("This image uses 2 AI credits. You have 4 AI credits.");
    expect(screen.getByText("Our finest — sharper, larger, and truer to your building's own lines.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("ai-choice-NIGHT"));
    fireEvent.press(screen.getByTestId("ai-choice-STAGED"));
    fireEvent.press(screen.getByTestId("ai-choice-HERITAGE"));
    fireEvent.changeText(screen.getByTestId("ai-note"), "  curtains open  ");
    fireEvent.press(screen.getByTestId("ai-make"));

    await waitFor(() => expect(screen).toHavePathname("/ai-image/r1"));
    expect(mockProjects.requestRender).toHaveBeenCalledTimes(1);
    expect(mockProjects.requestRender).toHaveBeenCalledWith("p1", {
      comboId: "c1",
      quality: "LUXURY",
      sourceImage: "CLEANED",
      timeOfDay: "NIGHT",
      borderMode: "KEEP_ORIGINAL",
      lighting: "NATURAL",
      furnishing: "STAGED",
      style: "HERITAGE",
      note: "curtains open",
    });
    await waitFor(() => expect(screen.getByTestId("ai-image-working")).toBeTruthy());
    expect(screen.getByText("Photographing your room")).toBeTruthy();
  });

  it("short of credits, buys what is missing with its price — and says so before the press", async () => {
    signedIn();
    mockMe.aiCredits.mockResolvedValue(wallet({ balance: 1 }));
    open();
    await waitFor(() => expect(screen.getByTestId("ai-make")).toBeTruthy());
    fireEvent.press(screen.getByTestId("ai-choice-LUXURY"));
    expect(screen.getByTestId("ai-cost")).toHaveTextContent("You need 1 more AI credit for this image, at ₹70 each.");
    expect(screen.queryByTestId("ai-make")).toBeNull();
    fireEvent.press(screen.getByTestId("ai-buy"));
    await waitFor(() => expect(screen).toHavePathname("/checkout"));
    expect(screen).toHaveSearchParams({ credits: "1", from: "ai-image" });
  });

  it("a wallet that won't load is not 0: no price and no button until it does", async () => {
    signedIn();
    mockMe.aiCredits.mockRejectedValue(new ApiError("network", 0, "Network error"));
    open();
    await waitFor(() => expect(screen.getByTestId("ai-wallet-failed")).toBeTruthy());
    expect(screen.queryByTestId("ai-make")).toBeNull();
    expect(screen.queryByTestId("ai-buy")).toBeNull();
  });

  it("obeys a 402 — the server's sentence, and the wallet read again", async () => {
    signedIn();
    mockProjects.requestRender.mockRejectedValue(
      new ApiError("http", 402, "You need 2 AI image credits to make this image and you have 1. Top up your AI wallet to carry on."),
    );
    open();
    await waitFor(() => expect(screen.getByTestId("ai-make")).toBeTruthy());
    const reads = mockMe.aiCredits.mock.calls.length;
    fireEvent.press(screen.getByTestId("ai-make"));
    await waitFor(() => expect(screen.getByTestId("ai-problem")).toHaveTextContent(/You need 2 AI image credits/));
    expect(mockMe.aiCredits.mock.calls.length).toBeGreaterThan(reads);
    expect(screen).toHavePathname("/ai-image/options");
  });

  it("an ask that goes unanswered is never sent again: the room's images say it started", async () => {
    signedIn();
    // The room's images before the ask, and after it (the server did start it).
    let asked = false;
    mockProjects.renders.mockImplementation(async () =>
      asked ? [image({ id: "r9" }), ready({ id: "r0", comboId: "c1" })] : [ready({ id: "r0", comboId: "c1" })],
    );
    mockProjects.requestRender.mockImplementation(async () => {
      asked = true;
      throw new ApiError("timeout", 0, "Timed out");
    });
    mockProjects.render.mockResolvedValue(image({ id: "r9" }));
    open();
    await waitFor(() => expect(screen.getByTestId("ai-make")).toBeTruthy());
    fireEvent.press(screen.getByTestId("ai-make"));
    await waitFor(() => expect(screen).toHavePathname("/ai-image/r9"));
    expect(mockProjects.requestRender).toHaveBeenCalledTimes(1);
  });

  it("an ask that goes unanswered, with no sign it started, says to look before trying again", async () => {
    signedIn();
    mockProjects.requestRender.mockRejectedValue(new ApiError("network", 0, "Network error"));
    open();
    await waitFor(() => expect(screen.getByTestId("ai-make")).toBeTruthy());
    fireEvent.press(screen.getByTestId("ai-make"));
    await waitFor(() => expect(screen.getByTestId("ai-problem")).toHaveTextContent(/If your image did start/));
    expect(mockProjects.requestRender).toHaveBeenCalledTimes(1);
  });

  it("offers Paint from only when the room has a cleaned photo, and words the outside for the outside", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ cleanedImageUrl: null, imageType: "OUTDOOR" }));
    open();
    await waitFor(() => expect(screen.getByText("Surroundings")).toBeTruthy());
    expect(screen.queryByText("Paint from")).toBeNull();
    fireEvent.press(screen.getByTestId("ai-choice-EMPTY"));
    expect(screen.getByText("Cleared of cars, bins and clutter, so the walls are fully visible.")).toBeTruthy();
  });

  it("an image of the room already being made is offered first", async () => {
    signedIn();
    mockProjects.renders.mockResolvedValue([image({ id: "r5", status: "RUNNING" })]);
    mockProjects.render.mockResolvedValue(image({ id: "r5", status: "RUNNING" }));
    open();
    await waitFor(() => expect(screen.getByTestId("ai-in-flight")).toBeTruthy());
    press("See it");
    await waitFor(() => expect(screen).toHavePathname("/ai-image/r5"));
  });

  it("an option no longer on the board says so", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/ai-image/options?projectId=p1&comboId=gone" });
    await waitFor(() => expect(screen.getByText("This option isn't on the room's colour board any more.")).toBeTruthy());
    press("Choose another option");
    await waitFor(() => expect(screen).toHavePathname("/ai-image/new"));
  });

  it("arrives with an earlier image's choices (Make another, Try again)", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/ai-image/options?projectId=p1&comboId=c1&quality=LUXURY&style=LUXE&timeOfDay=NIGHT&lighting=BOGUS" });
    await waitFor(() => expect(screen.getByTestId("ai-choice-LUXE")).toHaveProp("accessibilityState", { selected: true, disabled: false }));
    expect(screen.getByTestId("ai-choice-LUXURY")).toHaveProp("accessibilityState", { selected: true, disabled: false });
    expect(screen.getByTestId("ai-choice-NIGHT")).toHaveProp("accessibilityState", { selected: true, disabled: false });
    // A value it doesn't know is the default.
    expect(screen.getByTestId("ai-choice-NATURAL")).toHaveProp("accessibilityState", { selected: true, disabled: false });
  });
});

// ── C24 ───────────────────────────────────────────────────────────────────────

describe("C24 · AI image — working and result", () => {
  it("waits honestly, then shows the image to send, save, and send as a PDF with its shades", async () => {
    signedIn();
    const createdAt = ist(Date.now() - 5_000);
    mockProjects.render
      .mockResolvedValueOnce(image({ status: "RUNNING", createdAt }))
      .mockResolvedValue(ready({ style: "LUXE", quality: "LUXURY", createdAt }));
    renderRouter("./app", { initialUrl: "/ai-image/r1?projectId=p1" });
    await waitFor(() => expect(screen.getByTestId("ai-image-working")).toBeTruthy());
    expect(screen.getByText("Leave this running")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Your AI image is ready")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText("Luxe · Day · Natural light · Luxury")).toBeTruthy();

    fireEvent.press(screen.getByTestId("ai-send"));
    await waitFor(() => expect(mockFiles.shareRender).toHaveBeenCalledWith("file://cache/ai-images/r1.jpg", "Your AI image · Living room"));
    expect(mockFiles.renderFile).toHaveBeenCalledWith("https://bucket.s3/r1.jpg?sig=1", "r1");

    fireEvent.press(screen.getByTestId("ai-save"));
    await waitFor(() => expect(screen.getByText("Saved to your photos.")).toBeTruthy());

    fireEvent.press(screen.getByTestId("ai-pdf"));
    await waitFor(() => expect(mockFiles.sharePdf).toHaveBeenCalled());
    const pdf = mockFiles.sharePdf.mock.calls[0]![0];
    expect(String.fromCharCode(...pdf.slice(0, 8))).toBe("%PDF-1.4");
    expect(String.fromCharCode(...pdf)).toContain("HV0118");
  });

  it("asks for a fresh picture address when the old one has expired, once", async () => {
    signedIn();
    mockProjects.render.mockResolvedValueOnce(ready()).mockResolvedValue(ready({ imageUrl: "https://bucket.s3/r1.jpg?sig=2" }));
    mockFiles.renderFile.mockRejectedValueOnce(new Error("Picture not available (403)"));
    renderRouter("./app", { initialUrl: "/ai-image/r1?projectId=p1" });
    await waitFor(() => expect(screen.getByTestId("ai-send")).toBeTruthy());
    fireEvent.press(screen.getByTestId("ai-send"));
    await waitFor(() => expect(mockFiles.shareRender).toHaveBeenCalled());
    expect(mockFiles.renderFile).toHaveBeenLastCalledWith("https://bucket.s3/r1.jpg?sig=2", "r1");
  });

  it("says so when the photos may not be saved to, with a way to Settings", async () => {
    signedIn();
    mockProjects.render.mockResolvedValue(ready());
    mockFiles.saveRenderToPhotos.mockResolvedValue("denied");
    renderRouter("./app", { initialUrl: "/ai-image/r1?projectId=p1" });
    await waitFor(() => expect(screen.getByTestId("ai-save")).toBeTruthy());
    fireEvent.press(screen.getByTestId("ai-save"));
    await waitFor(() => expect(screen.getByTestId("ai-save-denied")).toBeTruthy());
    press("Open Settings");
    expect(mockFiles.openPhotoSettings).toHaveBeenCalled();
  });

  it("a failed image gives the server's reason; Try again is a new image with the same choices", async () => {
    signedIn();
    mockProjects.render.mockResolvedValue(
      image({ status: "FAILED", style: "MINIMAL", failureReason: "Your image couldn't be made just now. Your credit is back — please try again." }),
    );
    renderRouter("./app", { initialUrl: "/ai-image/r1?projectId=p1" });
    await waitFor(() => expect(screen.getByTestId("ai-image-failed")).toBeTruthy());
    expect(screen.getByText("Your image couldn't be made just now. Your credit is back — please try again.")).toBeTruthy();
    expect(screen.getByText("Trying again makes a new image, and uses credits again.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("ai-try-again"));
    await waitFor(() => expect(screen).toHavePathname("/ai-image/options"));
    expect(screen).toHaveSearchParams(expect.objectContaining({ projectId: "p1", comboId: "c1", style: "MINIMAL" }));
  });

  it("claims the credits are back only when the wallet shows it, for a reason it won't show", async () => {
    signedIn();
    mockProjects.render.mockResolvedValue(image({ status: "FAILED", failureReason: "REPLICATE_API_TOKEN not configured" }));
    renderRouter("./app", { initialUrl: "/ai-image/r1?projectId=p1" });
    await waitFor(() => expect(screen.getByText("Your image couldn't be made just now. Please try again.")).toBeTruthy());
    expect(screen.queryByText(/REPLICATE/)).toBeNull();
  });

  it("an image that isn't on the account says so plainly", async () => {
    signedIn();
    mockProjects.render.mockRejectedValue(new ApiError("http", 404, "Render not found: r1"));
    renderRouter("./app", { initialUrl: "/ai-image/r1?projectId=p1" });
    await waitFor(() => expect(screen.getByText("This AI image isn't on your account any more")).toBeTruthy());
    expect(screen.queryByText(/Render not found/)).toBeNull();
  });

  it("finds the room of an image opened without it", async () => {
    signedIn();
    mockMe.renders.mockResolvedValue([{ id: "r1", projectId: "p1", projectName: "Living room", status: "READY", imageUrl: "https://x/r1.jpg" }]);
    mockProjects.render.mockResolvedValue(ready());
    renderRouter("./app", { initialUrl: "/ai-image/r1" });
    await waitFor(() => expect(screen.getByText("Your AI image is ready")).toBeTruthy());
    expect(mockProjects.render).toHaveBeenCalledWith("p1", "r1");
  });
});

// ── The ways in and out ───────────────────────────────────────────────────────

describe("AI images, from elsewhere", () => {
  it("C25 offers a finished image of an option, and nothing for a failed one", async () => {
    signedIn();
    mockProjects.renders.mockResolvedValue([ready({ id: "r1", comboId: "c1" }), image({ id: "r2", comboId: "c2", status: "FAILED" })]);
    mockProjects.render.mockResolvedValue(ready());
    renderRouter("./app", { initialUrl: "/board/p1" });
    await waitFor(() => expect(screen.getByTestId("board-see-image-c1")).toBeTruthy());
    expect(screen.queryByTestId("board-see-image-c2")).toBeNull();
    fireEvent.press(screen.getByTestId("board-see-image-c1"));
    await waitFor(() => expect(screen).toHavePathname("/ai-image/r1"));
  });

  it("the Boards tab opens on the AI images when asked to", async () => {
    signedIn();
    mockMe.renders.mockResolvedValue([{ id: "r1", projectId: "p1", projectName: "Living room", status: "READY", imageUrl: "https://x/r1.jpg" }]);
    renderRouter("./app", { initialUrl: "/boards?tab=ai" });
    await waitFor(() => expect(screen.getByLabelText("AI image of Living room")).toBeTruthy());
  });

  it("after buying credits from C23, C29 leads back to the image", async () => {
    signedIn();
    savePending({ accountId: "u1", orderId: "order_ABC123xyz", amountPaise: 7000, rooms: 0, credits: 1, startedAt: Date.now() });
    mockBilling.verifyCart.mockResolvedValue({});
    await act(async () => {
      await verifyPayment("order_ABC123xyz", "pay_DEF456uvw", "c".repeat(64));
    });
    renderRouter("./app", { initialUrl: "/payment-result?order=order_ABC123xyz&from=ai-image" });
    await waitFor(() => expect(screen.getByTestId("payment-back-to-image")).toBeTruthy());
    expect(screen.queryByText("See your balance")).toBeNull();
  });
});
