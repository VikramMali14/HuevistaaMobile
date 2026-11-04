/**
 * The Shade Book (C34) and a picture of it opened large (C37) through the REAL route tree: beside
 * the shades in the Catalogue tab, the filters, which house to see them on, and every combination
 * in a grid of pictures — the free ones and the pass's price, buying it on the website — then one
 * opened large on every house it fits, stepped through, and saved with its Vista codes. Only the
 * network, the secure store, the browser and the phone's photos are faked.
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

const surface = (id: string, label: string) => ({ id, label });
const PHOTOS: ShadeBook["photos"] = [
  { id: "interior-2", kind: "INTERIOR", title: "Living room", width: 960, height: 540, version: "1", surfaces: [surface("walls", "Walls"), surface("ceiling", "Ceiling")] },
  {
    id: "interior-3",
    kind: "INTERIOR",
    title: "Sitting room",
    width: 800,
    height: 534,
    version: "2",
    surfaces: [surface("main-walls", "Main walls"), surface("feature-wall", "Feature wall"), surface("ceiling", "Ceiling")],
  },
  { id: "exterior-2", kind: "EXTERIOR", title: "Town house", width: 768, height: 1024, version: "3", surfaces: [surface("main-walls", "Main walls"), surface("highlight-walls", "Highlight walls")] },
  {
    id: "exterior-3",
    kind: "EXTERIOR",
    title: "Modern house",
    width: 563,
    height: 570,
    version: "7",
    surfaces: [surface("main-walls", "Main walls"), surface("frame", "Frame & borders"), surface("band", "Top band & column")],
  },
];

/** A house the team added: its pillars are highlight walls, its window frames a frame. */
const BUNGALOW: ShadeBook["photos"][number] = {
  id: "house-k3x9q2mf",
  kind: "EXTERIOR",
  title: "Corner bungalow",
  width: 800,
  height: 600,
  version: "9",
  surfaces: [surface("main-walls", "Main walls"), surface("highlight-walls", "Pillars"), surface("frame", "Window frames")],
};
const HOUSES = [...PHOTOS, BUNGALOW];

function page(id: string, photoId: string, title: string, codes: string[], hexes: string[], families: string[], sample = false): ShadeBookPage {
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
      shade: { hvCode: code, shadeCode: code, hexCode: hexes[i]! },
    })),
    families,
  };
}

const SAMPLE = page("s1", "exterior-3", "Pale beige with deep indigo blue", ["HV0348", "HV1102", "HV2210"], ["#E8DCC8", "#4F4D5A", "#F4F2EC"], ["beige", "blue", "white"], true);
const SECOND = page("p2", "exterior-2", "Off-white with sage green", ["HV0101", "HV0202"], ["#F4F2EC", "#7A8479"], ["white", "green"], true);
const THIRD = page("p3", "exterior-3", "Cream with charcoal", ["HV0400", "HV0500", "HV0600"], ["#EFE6D2", "#3B3B3B", "#F3F1EB"], ["beige", "grey", "white"]);
/** Every page of the book, open or not, by kind, colours and families: 239 in all. */
const FACETS: ShadeBook["facets"] = [
  { scope: "EXTERIOR", colours: 3, families: ["white", "beige", "blue"], count: 40 },
  { scope: "EXTERIOR", colours: 3, families: ["beige", "grey", "orange"], count: 187 },
  { scope: "EXTERIOR", colours: 2, families: ["white", "green"], count: 12 },
];
const ist = (fromNow: number) => new Date(Date.now() + fromNow + 5.5 * 3600_000).toISOString().slice(0, 19);

const shut = (): ShadeBook => ({
  access: { open: false, reason: "NONE", pricePaise: 4900, currency: "INR", hours: 24, purchasable: true },
  total: 239,
  totals: { "2": 12, "3": 227 },
  freeSamples: 1,
  photos: PHOTOS,
  houses: HOUSES,
  facets: FACETS,
  combinations: [SAMPLE, SECOND],
});
const opened = (): ShadeBook => ({
  access: { open: true, reason: "PASS", expiresAt: ist(20 * 3600_000), pricePaise: 4900, currency: "INR", hours: 24, purchasable: true },
  total: 3,
  totals: { "2": 1, "3": 2 },
  freeSamples: 1,
  photos: PHOTOS,
  houses: HOUSES,
  combinations: [SAMPLE, SECOND, THIRD],
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

/** A picture in the grid, by what it shows: the combination, the house and its codes in that house's order. */
const card = (label: string) => screen.getByLabelText(label);
const MODERN_SAMPLE = "Pale beige with deep indigo blue, on the Modern house: HV0348, HV1102, HV2210";
const TOWN_SECOND = "Off-white with sage green, on the Town house: HV0101, HV0202";

describe("C34 · Shade Book", () => {
  it("sits beside the shades, at the top of the Catalogue tab, which stays lit", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByLabelText("Shades, the Shade Book or the Colour finder")).toBeTruthy());
    // Six tabs: the Shade Book and the Colour finder have no buttons of their own.
    expect(screen.queryByTestId("tab-shade-book")).toBeNull();
    expect(screen.queryByTestId("tab-colour-finder")).toBeNull();

    fireEvent.press(screen.getByRole("tab", { name: "Shade Book" }));

    await waitFor(() => expect(screen).toHavePathname("/shade-book"));
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Shade Book", selected: true })).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: "Shades" }));
    await waitFor(() => expect(screen).toHavePathname("/catalogue"));
  });

  it("shows every combination as a picture on its own house, the free ones marked and the rest counted", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());

    expect(card(MODERN_SAMPLE)).toBeTruthy();
    expect(card(TOWN_SECOND)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Every house, each combination on its own", checked: true })).toBeTruthy();
    for (const id of ["interior-2", "interior-3", "exterior-2", "exterior-3", "house-k3x9q2mf"]) expect(screen.getByTestId(`shade-book-on-${id}`)).toBeTruthy();
    expect(screen.getAllByText("Free")).toHaveLength(2);
    expect(screen.getByTestId("shade-book-count")).toHaveTextContent("2 of 239 combinations");
    expect(screen.getByText("237 more combinations")).toBeTruthy();
    expect(screen.getAllByText("Open all 239 · ₹49 for 24 hours").length).toBeGreaterThan(0);
    expect(screen.queryByText("Save to photos")).toBeNull();
  });

  it("paints every combination it fits on the house chosen, the same photo for each, in the order of its parts", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());

    fireEvent.press(screen.getByTestId("shade-book-on-house-k3x9q2mf"));

    await waitFor(() => expect(card("Pale beige with deep indigo blue, on the Corner bungalow: HV0348, HV2210, HV1102")).toBeTruthy());
    expect(card("Cream with charcoal, on the Corner bungalow: HV0400, HV0600, HV0500")).toBeTruthy();
    // Two colours don't go on three parts.
    expect(screen.queryByTestId("shade-book-page-p2")).toBeNull();
    expect(screen.getByRole("radio", { name: "Corner bungalow, House, 3 colours", checked: true })).toBeTruthy();
  });

  it("narrows the book to two colours, or to a colour family, counting what the pass would add", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());

    fireEvent.press(screen.getByRole("tab", { name: "2 colours" }));
    await waitFor(() => expect(screen.queryByTestId("shade-book-page-s1")).toBeNull());
    expect(card(TOWN_SECOND)).toBeTruthy();
    expect(screen.getByText("11 more like these")).toBeTruthy();
    // Only the houses with two parts to paint them on.
    expect(screen.getByTestId("shade-book-on-exterior-2")).toBeTruthy();
    expect(screen.queryByTestId("shade-book-on-exterior-3")).toBeNull();

    fireEvent.press(screen.getByTestId("shade-book-clear"));
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());
    expect(screen.getByLabelText("Purple, 0 combinations")).toBeDisabled();

    fireEvent.press(screen.getByLabelText("Blue, 40 combinations"));
    await waitFor(() => expect(screen.queryByTestId("shade-book-page-p2")).toBeNull());
    expect(card(MODERN_SAMPLE)).toBeTruthy();
    expect(screen.getByText("39 more like these")).toBeTruthy();
  });

  it("says so while the book has no room's combination, and offers the rooms to paint them on", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());

    fireEvent.press(screen.getByRole("tab", { name: "Interior" }));

    await waitFor(() => expect(screen.getByText("No combinations like these in the book yet.")).toBeTruthy());
    for (const id of ["interior-2", "interior-3"]) expect(screen.getByTestId(`shade-book-on-${id}`)).toBeTruthy();
    expect(screen.queryByTestId("shade-book-on-exterior-3")).toBeNull();

    fireEvent.press(screen.getByText("Show the whole book"));
    await waitFor(() => expect(screen.getByTestId("shade-book-page-p3")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByTestId("shade-book-page-p3")).toBeTruthy());
    expect(screen.queryByText("Free")).toBeNull();
  });

  it("says plainly when the pass can't be bought here", async () => {
    signedIn();
    mockBook.get.mockResolvedValue({ ...shut(), access: { ...shut().access, purchasable: false } });
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());
    expect(screen.queryByTestId("shade-book-buy")).toBeNull();
    expect(screen.getAllByText("The pass can't be bought in this app right now.").length).toBeGreaterThan(0);
  });
});

describe("C37 · A Shade Book picture, opened large", () => {
  it("opens with each part's Vista code and every house it fits, and steps through the grid", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-p3")).toBeTruthy());

    fireEvent.press(screen.getByTestId("shade-book-page-p3"));

    await waitFor(() => expect(screen).toHavePathname("/shade-book/p3"));
    await waitFor(() => expect(screen.getByTestId("shade-book-position")).toHaveTextContent("3 of 3"));
    expect(screen.getByRole("header", { name: "Cream with charcoal" })).toBeTruthy();
    expect(screen.getByText("Modern house · House · 3 colours")).toBeTruthy();
    for (const part of ["Main walls, HV0400", "Frame & borders, HV0500", "Top band & column, HV0600"]) expect(screen.getByLabelText(part)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "1, Modern house, House, 3 colours", checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "2, Corner bungalow, House, 3 colours" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "3, Sitting room, Room, 3 colours" })).toBeTruthy();

    // Round to the first.
    fireEvent.press(screen.getByTestId("shade-book-next"));
    await waitFor(() => expect(screen).toHavePathname("/shade-book/s1"));
    expect(screen.getByTestId("shade-book-position")).toHaveTextContent("1 of 3");
    expect(screen.getByRole("header", { name: "Pale beige with deep indigo blue" })).toBeTruthy();
  });

  it("opens on the house the grid is painted on, and steps through that grid alone", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-s1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shade-book-on-house-k3x9q2mf"));
    await waitFor(() => expect(screen.queryByTestId("shade-book-page-p2")).toBeNull());

    fireEvent.press(screen.getByTestId("shade-book-page-s1"));

    await waitFor(() => expect(screen.getByTestId("shade-book-position")).toHaveTextContent("1 of 2"));
    expect(screen.getByText("Corner bungalow · House · 3 colours")).toBeTruthy();
    expect(screen.getByLabelText("Pillars, HV2210")).toBeTruthy();
    fireEvent.press(screen.getByTestId("shade-book-next"));
    await waitFor(() => expect(screen.getByTestId("shade-book-position")).toHaveTextContent("2 of 2"));
    expect(screen.getByRole("header", { name: "Cream with charcoal" })).toBeTruthy();
    expect(screen.getByText("Corner bungalow · House · 3 colours")).toBeTruthy();
  });

  it("paints it on another house there, and saves that picture while the pass runs", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-page-p2")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shade-book-page-p2"));
    await waitFor(() => expect(screen.getByText("Town house · House · 2 colours")).toBeTruthy());

    fireEvent.press(screen.getByTestId("shade-book-photo-interior-2"));

    // The lighter colour goes up on the ceiling.
    await waitFor(() => expect(screen.getByText("Living room · Room · 2 colours")).toBeTruthy());
    expect(screen.getByLabelText("Walls, HV0202")).toBeTruthy();
    expect(screen.getByLabelText("Ceiling, HV0101")).toBeTruthy();
    fireEvent.press(screen.getByText("Save to photos"));

    await waitFor(() => expect(mockPictures.savePictureToPhotos).toHaveBeenCalled());
    expect(mockPictures.pictureFile).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }), expect.objectContaining({ id: "interior-2" }));
  });

  it("offers the pass instead of saving while the book is shut", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book/s1" });
    await waitFor(() => expect(screen.getByText("Open the book to save this picture with its Vista codes.")).toBeTruthy());
    expect(screen.queryByText("Save to photos")).toBeNull();
    expect(screen.getAllByTestId("shade-book-buy").length).toBeGreaterThan(0);
    // Opened from a link with no grid: it steps through what the book sends.
    expect(screen.getByTestId("shade-book-position")).toHaveTextContent("1 of 2");
  });

  it("says so when the combination isn't in the book this reader can open", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book/gone" });
    await waitFor(() => expect(screen.getByText("This combination isn't in the book you can open.")).toBeTruthy());
  });
});
