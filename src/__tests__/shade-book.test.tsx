/**
 * The Shade Book (C34) through the REAL route tree: beside the shades in the Catalogue tab,
 * every house the chosen combination fits painted along the top, the filters and the
 * combinations below — the free ones and the pass's price, buying it on the website, and saving
 * the picture with its Vista codes. Only the network, the secure store, the browser and the
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

function page(id: string, photoId: string, title: string, codes: string[], families: string[], sample = false): ShadeBookPage {
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
    families,
  };
}

const SAMPLE = page("s1", "exterior-3", "Pale beige with deep indigo blue", ["HV0348", "HV1102", "HV2210"], ["beige", "blue", "white"], true);
const SECOND = page("p2", "exterior-2", "Off-white with sage green", ["HV0101", "HV0202"], ["white", "green"], true);
const THIRD = page("p3", "exterior-3", "Cream with charcoal", ["HV0400", "HV0500", "HV0600"], ["beige", "grey", "orange"]);
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
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(new RegExp(SAMPLE.title)));
    expect(screen.getByRole("tab", { name: "Shade Book", selected: true })).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: "Shades" }));
    await waitFor(() => expect(screen).toHavePathname("/catalogue"));
  });

  it("opens on the first combination, painted on every house with as many parts, the combinations below", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toBeTruthy());
    // Its own photo, the house the team added, then the room with three parts; none with two.
    for (const id of ["exterior-3", "house-k3x9q2mf", "interior-3"]) expect(screen.getByTestId(`shade-book-photo-${id}`)).toBeTruthy();
    for (const id of ["exterior-2", "interior-2"]) expect(screen.queryByTestId(`shade-book-photo-${id}`)).toBeNull();
    expect(screen.getByRole("radio", { name: "1, Modern house, House, 3 colours", checked: true })).toBeTruthy();
    expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Pale beige with deep indigo blue/);
    for (const code of ["HV0348", "HV1102", "HV2210"]) expect(screen.getAllByText(code).length).toBeGreaterThan(0);
    // Two colours and three alike until narrowed, the free ones marked; the rest counted.
    expect(screen.getByText(SECOND.title)).toBeTruthy();
    expect(screen.getAllByText("Free")).toHaveLength(2);
    expect(screen.getByText("237 more combinations")).toBeTruthy();
    expect(screen.getAllByText("Open all 239 · ₹49 for 24 hours").length).toBeGreaterThan(0);
    expect(screen.queryByText("Save to photos")).toBeNull();
  });

  it("moves to a house with two parts for a two-colour combination, its parts named by the room chosen", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Off-white with sage green, HV0101, HV0202"));

    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Town house/));
    expect(screen.getByTestId("shade-book-photo-interior-2")).toBeTruthy();
    expect(screen.queryByTestId("shade-book-photo-exterior-3")).toBeNull();
    fireEvent.press(screen.getByTestId("shade-book-photo-interior-2"));
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Living room/));
    expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Walls/);
    expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Ceiling/);
  });

  it("narrows the book to two colours, or to a colour family, counting what the pass would add", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(shut());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toBeTruthy());

    fireEvent.press(screen.getByRole("tab", { name: "2 colours" }));
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Off-white with sage green/));
    expect(screen.queryByText("Pale beige with deep indigo blue")).toBeNull();
    expect(screen.getByText("11 more like these")).toBeTruthy();

    fireEvent.press(screen.getByTestId("shade-book-clear"));
    await waitFor(() => expect(screen.getAllByText("Pale beige with deep indigo blue").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Purple, 0 combinations")).toBeDisabled();

    fireEvent.press(screen.getByLabelText("Blue, 40 combinations"));
    await waitFor(() => expect(screen.queryByText(SECOND.title)).toBeNull());
    expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Pale beige with deep indigo blue/);
    expect(screen.getByText("39 more like these")).toBeTruthy();
  });

  it("shows the rooms unpainted, and says so, while the book has no room's combination", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toBeTruthy());

    fireEvent.press(screen.getByRole("tab", { name: "Interior" }));

    await waitFor(() => expect(screen.getByText("No combinations like these in the book yet.")).toBeTruthy());
    expect(screen.queryByTestId("shade-book-chosen")).toBeNull();
    for (const id of ["interior-2", "interior-3"]) expect(screen.getByTestId(`shade-book-photo-${id}`)).toBeTruthy();
    expect(screen.queryByTestId("shade-book-photo-exterior-3")).toBeNull();
  });

  it("paints the combination chosen, and keeps it on another photo with as many parts", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Cream with charcoal, HV0400, HV0500, HV0600"));
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Cream with charcoal/));
    fireEvent.press(screen.getByTestId("shade-book-photo-interior-3"));

    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Sitting room/));
    expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Cream with charcoal/);
    expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Feature wall/);
  });

  it("says under the photo, which stays above the list, what is painted on it as another combination is chosen", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() =>
      expect(screen.getByTestId("shade-book-caption", { includeHiddenElements: true })).toHaveTextContent("Pale beige with deep indigo blue · HV0348 · HV1102 · HV2210"),
    );

    fireEvent.press(screen.getByLabelText("Cream with charcoal, HV0400, HV0500, HV0600"));

    await waitFor(() =>
      expect(screen.getByTestId("shade-book-caption", { includeHiddenElements: true })).toHaveTextContent("Cream with charcoal · HV0400 · HV0500 · HV0600"),
    );
  });

  it("saves the chosen combination's picture on the chosen photo while the pass runs", async () => {
    signedIn();
    mockBook.get.mockResolvedValue(opened());
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByText("Save to photos")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Off-white with sage green, HV0101, HV0202"));
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(/Off-white with sage green/));

    fireEvent.press(screen.getByText("Save to photos"));

    await waitFor(() => expect(mockPictures.savePictureToPhotos).toHaveBeenCalled());
    expect(mockPictures.pictureFile).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }), expect.objectContaining({ id: "exterior-2" }));
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
    await waitFor(() => expect(screen.getAllByText(THIRD.title).length).toBeGreaterThan(0));
    expect(screen.queryByText("Free")).toBeNull();
  });

  it("says plainly when the pass can't be bought here", async () => {
    signedIn();
    mockBook.get.mockResolvedValue({ ...shut(), access: { ...shut().access, purchasable: false } });
    renderRouter("./app", { initialUrl: "/shade-book" });
    await waitFor(() => expect(screen.getByTestId("shade-book-chosen")).toHaveTextContent(new RegExp(SAMPLE.title)));
    expect(screen.queryByTestId("shade-book-buy")).toBeNull();
    expect(screen.getAllByText("The pass can't be bought in this app right now.").length).toBeGreaterThan(0);
  });
});
