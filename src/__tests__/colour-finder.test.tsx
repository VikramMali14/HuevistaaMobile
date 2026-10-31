/**
 * The Colour finder (C35) through the REAL route tree: beside the shades and the Shade Book in
 * the Catalogue tab, a photo chosen and tapped for free, and the HueVistaa shades for that
 * colour — Vista codes and colours alone — once the ₹49 pass is running, bought on the website.
 * Only the network, the secure store, the browser, the photo picker and the photo's pixels are
 * faked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { queryClient } from "@/api/query-client";
import type { ColourFinderAccess, UserProfile, VistaShadeMatch } from "@/api/types";
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
const mockClipboard = { setStringAsync: jest.fn(async () => true) };
jest.mock("expo-clipboard", () => mockClipboard);
const mockPicker = {
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file:///cushion.jpg", width: 4000, height: 3000 }] })),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
};
jest.mock("expo-image-picker", () => mockPicker);

/** A photo of one teal cushion, filling the frame: any tap reads it. */
const TEAL: [number, number, number] = [0x0b, 0x7a, 0x6e];
jest.mock("@/features/colour-finder/photo-pixels", () => ({
  readFinderPhoto: jest.fn(async () => {
    const data = new Uint8ClampedArray(40 * 30 * 4);
    for (let i = 0; i < 40 * 30; i++) data.set([...TEAL, 255], i * 4);
    return { uri: "file:///cache/cushion-shown.jpg", pixels: { width: 40, height: 30, data }, even: data };
  }),
}));

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
const mockFinder = {
  get: jest.fn<Promise<ColourFinderAccess>, []>(),
  match: jest.fn<Promise<VistaShadeMatch[]>, [string, number?]>(),
  passOrder: jest.fn(),
  passVerify: jest.fn(),
};
jest.mock("@/api/endpoints/colour-finder", () => ({
  get colourFinderApi() {
    return mockFinder;
  },
}));

const ist = (fromNow: number) => new Date(Date.now() + fromNow + 5.5 * 3600_000).toISOString().slice(0, 19);
const SHUT: ColourFinderAccess = { open: false, reason: "NONE", pricePaise: 4900, currency: "INR", hours: 24, purchasable: true };
const OPEN = (): ColourFinderAccess => ({ ...SHUT, open: true, reason: "PASS", expiresAt: ist(20 * 3600_000) });
const MATCHES: VistaShadeMatch[] = [
  { hvCode: "HV9101", hexCode: "#0B7A6E", colourName: "Deep teal", deltaE: 0 },
  { hvCode: "HV9102", hexCode: "#0D7F70", colourName: "Deep teal green", deltaE: 2.1 },
];

function signedIn() {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Priya Sharma", provider: "LOCAL", role: "CUSTOMER", email: "priya@example.com" });
}

/** Choose a photo, then tap it. */
async function tapAColour() {
  await waitFor(() => expect(screen.getByText("Choose a photo")).toBeTruthy());
  fireEvent.press(screen.getByText("Choose a photo"));
  await waitFor(() => expect(screen.getByTestId("colour-finder-photo")).toBeTruthy());
  fireEvent.press(screen.getByTestId("colour-finder-photo"), { nativeEvent: { locationX: 10, locationY: 10 } });
  await waitFor(() => expect(screen.getByTestId("colour-finder-picked")).toBeTruthy());
}

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  mockAuth.profile.mockReset();
  for (const fn of Object.values(mockFinder)) fn.mockReset();
  mockBrowser.openAuthSessionAsync.mockReset();
  mockBilling.reportCheckout.mockClear();
  mockClipboard.setStringAsync.mockClear();
  forgetRememberedRoute();
  queryClient.clear();
  await AsyncStorage.clear();
});

describe("C35 · Colour finder", () => {
  it("sits beside the shades and the Shade Book, in the Catalogue tab, which stays lit", async () => {
    signedIn();
    mockFinder.get.mockResolvedValue(SHUT);
    renderRouter("./app", { initialUrl: "/catalogue" });
    await waitFor(() => expect(screen.getByLabelText("Shades, the Shade Book or the Colour finder")).toBeTruthy());
    expect(screen.queryByTestId("tab-colour-finder")).toBeNull();

    fireEvent.press(screen.getByRole("tab", { name: "Colour finder" }));

    await waitFor(() => expect(screen).toHavePathname("/colour-finder"));
    expect(screen.getByRole("tab", { name: "Colour finder", selected: true })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Choose a photo")).toBeTruthy());
  });

  it("lets a colour be picked for free, and asks for nothing until the pass is running", async () => {
    signedIn();
    mockFinder.get.mockResolvedValue(SHUT);
    renderRouter("./app", { initialUrl: "/colour-finder" });
    await waitFor(() => expect(screen.getAllByTestId("colour-finder-buy").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Unlock 24 hours · ₹49").length).toBeGreaterThan(0);

    await tapAColour();

    expect(screen.getByTestId("colour-finder-picked")).toHaveTextContent(/#0B7A6E/);
    expect(screen.getByTestId("colour-finder-shut")).toHaveTextContent(/See the HueVistaa shades for this colour/);
    expect(mockFinder.match).not.toHaveBeenCalled();
  });

  it("with a pass, lists HueVistaa shades by Vista code and colour, and copies a code", async () => {
    signedIn();
    mockFinder.get.mockResolvedValue(OPEN());
    mockFinder.match.mockResolvedValue(MATCHES);
    renderRouter("./app", { initialUrl: "/colour-finder" });
    await waitFor(() => expect(screen.getByText(/Your Colour finder is open until/)).toBeTruthy());

    await tapAColour();

    await waitFor(() => expect(screen.getByTestId("colour-finder-matches")).toBeTruthy());
    expect(mockFinder.match).toHaveBeenCalledWith("#0b7a6e", 6);
    const list = screen.getByTestId("colour-finder-matches");
    expect(list).toHaveTextContent(/HV9101/);
    expect(list).toHaveTextContent(/Deep teal green/);
    expect(list).toHaveTextContent(/Very close/);

    fireEvent.press(screen.getByLabelText("Deep teal, Vista code HV9101, Very close. Tap to copy the code."));
    await waitFor(() => expect(mockClipboard.setStringAsync).toHaveBeenCalledWith("HV9101"));
  });

  it("buys the pass on the website and shows the shades once the server confirms it", async () => {
    signedIn();
    mockFinder.get.mockResolvedValueOnce(SHUT).mockResolvedValue(OPEN());
    mockFinder.match.mockResolvedValue(MATCHES);
    mockFinder.passOrder.mockResolvedValue({
      orderId: "order_FINDER1234",
      kind: "CUSTOMER_COLOR_FINDER",
      label: "Colour finder",
      amount: 4900,
      currency: "INR",
      hours: 24,
      razorpayKeyId: "rzp_test_123456",
    });
    mockFinder.passVerify.mockResolvedValue({
      kind: "CUSTOMER_COLOR_FINDER",
      label: "Colour finder",
      startsAt: ist(0),
      expiresAt: ist(24 * 3600_000),
      amountPaise: 4900,
    });
    mockBrowser.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `huevista://pay/callback#status=success&order_id=order_FINDER1234&payment_id=pay_FINDER6789&signature=${"f".repeat(64)}`,
    });
    renderRouter("./app", { initialUrl: "/colour-finder" });
    await tapAColour();

    fireEvent.press(screen.getAllByTestId("colour-finder-buy")[0]!);

    await waitFor(() => expect(screen.getByTestId("shade-book-notice")).toHaveTextContent(/The Colour finder is open until/));
    const [url] = mockBrowser.openAuthSessionAsync.mock.calls[0] as [string];
    expect(url).toContain("amount=4900");
    expect(mockFinder.passVerify).toHaveBeenCalledWith({ orderId: "order_FINDER1234", paymentId: "pay_FINDER6789", signature: "f".repeat(64) });
    await waitFor(() => expect(screen.getByTestId("colour-finder-matches")).toHaveTextContent(/HV9101/));
  });

  it("says plainly when the pass can't be bought here", async () => {
    signedIn();
    mockFinder.get.mockResolvedValue({ ...SHUT, purchasable: false });
    renderRouter("./app", { initialUrl: "/colour-finder" });
    await waitFor(() => expect(screen.getAllByText("The pass can't be bought in this app right now.").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("colour-finder-buy")).toBeNull();
  });
});
