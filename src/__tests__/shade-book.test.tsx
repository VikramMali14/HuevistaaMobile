/**
 * The Shade Book (C34, C35) through the REAL route tree: the tab beside Catalogue, the free
 * samples and the pass's price, buying it on the website, a page large, and saving its
 * picture with the Vista codes. Only the network, the secure store, the browser and the
 * phone's photos are faked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { queryClient } from "@/api/query-client";
import type { ShadeBook, ShadeBookPage, UserProfile } from "@/api/types";
import { forgetRememberedRoute } from "@/auth/pending-route";

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
const mockBrowser = { openAuthSessionAsync: jest.fn(), openBrowserAsync: jest.fn(async () => ({})) };
jest.mock("expo-web-browser", () => mockBrowser);

const mockAuth = { profile: jest.fn<Promise<UserProfile>, []>(), logout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));
jest.mock("@/api/endpoints/me", () => ({
  meApi: new Proxy({}, { get: () => () => new Promise<never>(() => {}) }),
}));
const mockBilling = { reportCheckout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/billing", () => ({
  get billingApi() {
    return mockBilling;
  },
}));
const mockBook = { get: jest.fn<Promise<ShadeBook>, []>(), passOrder: jest.fn(), passVerify: jest.fn() };
jest.mock("@/api/endpoints/shade-book", () => ({
  ...jest.requireActual("@/api/endpoints/shade-book"),
  get shadeBookApi() {
    return mockBook;
  },
}));
const mockPictures = {
  pictureFile: jest.fn(async (_page: unknown) => "file:///cache/shade-book/huevistaa-shade-book-HV0101-HV0202.jpg"),
  savePictureToPhotos: jest.fn(async (_uri: string): Promise<"saved" | "denied"> => "saved"),
  sharePicture: jest.fn(async () => undefined),
  clearShadeBookFiles: jest.fn(),
};
jest.mock("@/features/shade-book/pictures", () => ({
  ...jest.requireActual("@/features/shade-book/pictures"),
  get pictureFile() {
    return mockPictures.pictureFile;
  },
  get savePictureToPhotos() {
    return mockPictures.savePictureToPhotos;
  },
  get sharePicture() {
    return mockPictures.sharePicture;
  },
  get clearShadeBookFiles() {
    return mockPictures.clearShadeBookFiles;
  },
}));

const PHOTOS: ShadeBook["photos"] = [
  {
    id: "exterior-3",
    kind: "EXTERIOR",
    title: "Modern house",
    width: 563,
    height: 570,
    version: "7",
    surfaces: [
      { id: "main-walls", label: "Main walls" },
      { id: "frame", label: "Frame & borders" },
      { id: "band", label: "Top band & column" },
    ],
  },
  {
    id: "exterior-2",
    kind: "EXTERIOR",
    title: "Town house",
    width: 768,
    height: 1024,
    version: "3",
    surfaces: [
      { id: "main-walls", label: "Main walls" },
      { id: "highlight-walls", label: "Highlight walls" },
    ],
  },
];

function page(id: string, photoId: string, title: string, codes: string[], sample = false): ShadeBookPage {
  const photo = PHOTOS.find((p) => p.id === photoId)!;
  return {
    id,
    photoId,
    scope: "EXTERIOR",
    colours: codes.length,
    title,
    sample,
    shades: codes.map((code, i) => ({
      surfaceId: photo.surfaces[i]!.id,
      surfaceLabel: photo.surfaces[i]!.label,
      shade: { hvCode: code, shadeCode: code, hexCode: "#C9B79C" },
    })),
  };
}

const SAMPLE = page("s1", "exterior-3", "Pale beige with deep indigo blue", ["HV0348", "HV1102", "HV2210"], true);
const SECOND = page("p2", "exterior-2", "Off-white with sage green", ["HV0101", "HV0202"]);
const ist = (fromNow: number) => new Date(Date.now() + fromNow + 5.5 * 3600_000).toISOString().slice(0, 19);

const shut = (): ShadeBook => ({
  access: { open: false, reason: "NONE", pricePaise: 4900, currency: "INR", hours: 24, purchasable: true },
  total: 227,
  freeSamples: 1,
  photos: PHOTOS,
  combinations: [SAMPLE],
});
const opened = (): ShadeBook => ({
  access: { open: true, reason: "PASS", expiresAt: ist(20 * 3600_000), pricePaise: 4900, currency: "INR", hours: 24, purchasable: true },
  total: 2,
  freeSamples: 1,
  photos: PHOTOS,
  combinations: [SAMPLE, SECOND],
});

function signedIn() {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Priya Sharma", provider: "LOCAL", role: "CUSTOMER", email: "priya@example.com" });
}

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  mockAuth.profile.mockReset();
  for (const fn of Object.values(mockBook)) fn.mockReset();
  mockBrowser.openAuthSessionAsync.mockReset();
  mockBilling.reportCheckout.mockClear();
  mockPictures.pictureFile.mockClear();
  mockPictures.savePictureToPhotos.mockClear();
  mockPictures.sharePicture.mockClear();
  forgetRememberedRoute();
  queryClient.clear();
  await AsyncStorage.clear();
});

describe("C34 · Shade Book", () => {
  it("is a tab beside Catalogue", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/home" });
    await waitFor(() => expect(screen.getAllByText("Catalogue").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Shade Book").length).toBeGreaterThan(0);
    expect(screen.getByTestId("tab-shade-book")).toBeTruthy();
  });

  it("shows the free sample with its Vista codes, counts the rest, and offers the pass at the server's price", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByText(SAMPLE.title)).toBeTruthy());
    expect(screen.getByText("Free sample")).toBeTruthy();
    for (const code of ["HV0348", "HV1102", "HV2210"]) expect(screen.getByText(code)).toBeTruthy();
    expect(screen.getByText("226 more combinations")).toBeTruthy();
    expect(screen.getAllByText("Open all 227 · ₹49 for 24 hours").length).toBeGreaterThan(0);
  });

  it("buys the pass on the website and opens the book once the server confirms it", async () => {
    signedIn();
    mockBook.get.mockResolvedValueOnce(shut()).mockResolvedValue(opened());
    mockBook.passOrder.mockResolvedValue({
      orderId: "order_SHADE12345",
      kind: "SHADE_BOOK",
      label: "Shade Book",
      amount: 4900,
      currency: "INR",
      hours: 24,
      razorpayKeyId: "rzp_test_123456",
    });
    mockBook.passVerify.mockResolvedValue({ kind: "SHADE_BOOK", label: "Shade Book", startsAt: ist(0), expiresAt: ist(24 * 3600_000), amountPaise: 4900 });
    mockBrowser.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `huevista://pay/callback#status=success&order_id=order_SHADE12345&payment_id=pay_SHADE6789&signature=${"e".repeat(64)}`,
    });
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getAllByTestId("shade-book-buy").length).toBeGreaterThan(0));

    fireEvent.press(screen.getAllByTestId("shade-book-buy")[0]!);

    await waitFor(() => expect(screen.getByTestId("shade-book-notice")).toBeTruthy());
    expect(screen.getByTestId("shade-book-notice")).toHaveTextContent(/The Shade Book is open until/);
    const [url] = mockBrowser.openAuthSessionAsync.mock.calls[0] as [string];
    expect(url).toContain("amount=4900");
    expect(mockBook.passVerify).toHaveBeenCalledWith({ orderId: "order_SHADE12345", paymentId: "pay_SHADE6789", signature: "e".repeat(64) });
    await waitFor(() => expect(screen.getByText(SECOND.title)).toBeTruthy());
    expect(screen.queryByText("Free sample")).toBeNull();
  });

  it("says plainly when the pass can't be bought here", async () => {
    signedIn();
    mockBook.get.mockResolvedValue({ ...shut(), access: { ...shut().access, purchasable: false } });
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByText(SAMPLE.title)).toBeTruthy());
    expect(screen.queryByTestId("shade-book-buy")).toBeNull();
    expect(screen.getAllByText("The pass can't be bought in this app right now.").length).toBeGreaterThan(0);
  });
});

describe("C35 · Shade Book page", () => {
  it("saves the page's picture with its Vista codes to the photos while the pass runs", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book/p2" });
    await waitFor(() => expect(screen.getByText(SECOND.title)).toBeTruthy());
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText("HV0101")).toBeTruthy();

    fireEvent.press(screen.getByText("Save to photos"));

    await waitFor(() => expect(mockPictures.savePictureToPhotos).toHaveBeenCalled());
    expect(mockPictures.pictureFile).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
  });

  it("offers the pass instead of saving while the book is shut", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book/s1" });
    await waitFor(() => expect(screen.getByText(SAMPLE.title)).toBeTruthy());
    expect(screen.queryByText("Save to photos")).toBeNull();
    expect(screen.getByText("Open the book to save this picture with its Vista codes.")).toBeTruthy();
    expect(screen.getByTestId("shade-book-buy")).toBeTruthy();
  });

  it("says so when the page isn't in the book any more", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book/gone" });
    await waitFor(() => expect(screen.getByText("This combination isn't in the book any more.")).toBeTruthy());
  });
});
