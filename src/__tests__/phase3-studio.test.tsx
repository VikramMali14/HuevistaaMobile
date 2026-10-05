/**
 * Phase 3 through the REAL route tree: Studio, Add photo, Name it, the room opener, Tidy
 * up, Walls found, Adjust, Paint, the shade picker, suggestions, Before and after and the
 * report. Only the network, the camera and picker, the image tools, sharing and the
 * secure store are faked; the live canvas renders as an empty view (Jest has no GPU).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { ApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import type { ProjectSummary, RoomDetail, RoomRegion, UserProfile } from "@/api/types";
import { forgetRememberedRoute } from "@/auth/pending-route";
import { applyColours, getRoomPaint, initRoom, pushRecent, resetPaintStore, resetRecentShades } from "@/features/studio/paint-store";
import { clearUpload } from "@/features/studio/photo-upload";
import { resetTrays } from "@/features/studio/tray-store";
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
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

let mockPermission: { granted: boolean; canAskAgain: boolean } | null = { granted: true, canAskAgain: true };
const mockRequestPermission = jest.fn(async () => mockPermission);
jest.mock("expo-camera", () => {
  // jest.mock factories run before imports are set up, so they load their own.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { forwardRef, useEffect, useImperativeHandle } = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    CameraView: forwardRef(function CameraView(props: { onCameraReady?: () => void }, ref: unknown) {
      useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: "file://shot.jpg", width: 4000, height: 3000 }) }));
      const { onCameraReady } = props;
      useEffect(() => onCameraReady?.(), [onCameraReady]);
      return <View {...props} />;
    }),
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});
const mockPick = jest.fn();
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => {
      const ctx = {
        resize: () => ctx,
        renderAsync: async () => ({ saveAsync: async () => ({ uri: "file://small.jpg", width: 2048, height: 1536 }) }),
      };
      return ctx;
    },
  },
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("@/features/studio/engine/texture-loader", () => ({
  loadTexture: jest.fn(async () => ({ pixels: { localUri: "file://x" }, width: 800, height: 600 })),
  loadBundledTexture: jest.fn(async () => ({ pixels: { localUri: "file://x" }, width: 800, height: 600 })),
  clearStudioCache: jest.fn(),
}));

const mockAuth = { profile: jest.fn<Promise<UserProfile>, []>(), logout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));

const mockMe = {
  entitlement: jest.fn(),
  projectOptions: jest.fn(),
  aiCredits: jest.fn(),
  projects: jest.fn<Promise<ProjectSummary[]>, []>(),
  renders: jest.fn(),
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
  create: jest.fn(),
  rename: jest.fn(),
  remove: jest.fn(),
  segment: jest.fn(),
  status: jest.fn(),
  saveColours: jest.fn(),
  savePlan: jest.fn(),
  addWall: jest.fn(),
  replaceMask: jest.fn(),
  removeWall: jest.fn(),
  maskPath: (id: string, regionId: number) => `/api/projects/${id}/regions/${regionId}/mask`,
  suggestions: jest.fn(),
  latestReport: jest.fn(),
  report: jest.fn(),
};
// Read lazily: the paint store imported above loads this module before `mockProjects` exists.
jest.mock("@/api/endpoints/projects", () => ({
  get projectsApi() {
    return mockProjects;
  },
}));
const mockUpload = jest.fn();
jest.mock("@/api/endpoints/images", () => ({ uploadPhoto: (...args: unknown[]) => mockUpload(...args) }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function signedIn() {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Priya Sharma", provider: "LOCAL", role: "CUSTOMER" });
}
const summary = (extra: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "p1",
  name: "Living room",
  status: "SEGMENTED",
  imageId: "i1",
  imageUrl: "/api/images/files/p1.jpg",
  regionCount: 3,
  updatedAt: "2026-10-04T10:00:00",
  ...extra,
});
const region = (id: number, category: RoomRegion["category"], extra: Partial<RoomRegion> = {}): RoomRegion => ({
  id,
  label: "",
  category,
  maskUrl: `https://bucket.s3/masks/${id}.png?sig=abc`,
  appliedHexCode: null,
  manual: false,
  inPlan: true,
  ...extra,
});
const room = (extra: Partial<RoomDetail> = {}): RoomDetail => ({
  id: "p1",
  name: "Living room",
  status: "SEGMENTED",
  imageId: "i1",
  imageUrl: "/api/images/files/p1.jpg",
  cleanedImageUrl: "/api/images/files/p1-clean.jpg",
  regions: [region(11, "MAIN_WALL"), region(12, "ACCENT_WALL"), region(13, "TRIM")],
  ...extra,
});
const shade = (code: string, hex: string, family: string, lrv: number): BackendShade => ({
  shadeCode: code,
  hvCode: code,
  hexCode: hex,
  shadeFamily: family,
  lrv,
  brandName: "Asian Paints",
  brandSlug: "asian-paints",
});
const SHADES = [shade("HV0101", "#e8d5b0", "Off Whites", 72), shade("HV0118", "#7b8a72", "Greens", 30), shade("HV0124", "#3e4a52", "Greys", 10)];

const press = (text: string | RegExp) => fireEvent.press(screen.getByText(text));
const pressLast = (text: string | RegExp) => {
  const all = screen.getAllByText(text);
  fireEvent.press(all[all.length - 1]!);
};

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  for (const group of [mockAuth, mockMe, mockShades, mockLibrary, mockProjects]) {
    for (const fn of Object.values(group)) if (jest.isMockFunction(fn)) fn.mockReset();
  }
  mockUpload.mockReset();
  mockPick.mockReset();
  mockPermission = { granted: true, canAskAgain: true };
  mockAuth.logout.mockResolvedValue(undefined);
  mockMe.entitlement.mockResolvedValue({ customerId: "u1", projectAllowance: 3, projectsCreated: 1, projectsRemaining: 2 });
  mockMe.projectOptions.mockResolvedValue({ subscribed: false, projectPricePoints: 0, projectPricePaise: 19900, pointsBalance: 0, validDays: 30, availableCredits: 0 });
  mockMe.aiCredits.mockResolvedValue({ balance: 0, eligible: false });
  mockMe.projects.mockResolvedValue([]);
  mockMe.renders.mockResolvedValue([]);
  mockMe.shopCombos.mockResolvedValue([]);
  mockLibrary.list.mockResolvedValue([]);
  mockShades.mine.mockResolvedValue(SHADES);
  mockShades.myBrands.mockResolvedValue([{ name: "Asian Paints", slug: "asian-paints", shadeCount: 3 }]);
  mockShades.scheme.mockResolvedValue({ showBrands: false, showNames: false, showRealCodes: false });
  mockProjects.get.mockResolvedValue(room());
  mockProjects.latestReport.mockResolvedValue(null);
  mockProjects.saveColours.mockResolvedValue(undefined);
  mockProjects.savePlan.mockResolvedValue(undefined);
  resetPaintStore();
  resetTrays();
  await resetRecentShades();
  clearUpload();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } });
  forgetRememberedRoute();
  await AsyncStorage.clear();
});

// ── C2 Studio ─────────────────────────────────────────────────────────────────

describe("C2 · Studio", () => {
  it("splits rooms into in progress and finished, and opens one", async () => {
    signedIn();
    mockMe.projects.mockResolvedValue([summary(), summary({ id: "p2", name: "Old bedroom", closedAt: "2026-09-01T10:00:00" })]);
    renderRouter("./app", { initialUrl: "/studio" });
    await waitFor(() => expect(screen.getByText("Living room")).toBeTruthy());
    expect(screen.queryByText("Old bedroom")).toBeNull();
    press("Finished · 1");
    await waitFor(() => expect(screen.getByText("Old bedroom")).toBeTruthy());
    press("In progress · 1");
    press("Living room");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/walls"));
  });

  it("with no rooms, offers to start one", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/studio" });
    await waitFor(() => expect(screen.getByText("No rooms yet")).toBeTruthy());
    press("Start a room");
    await waitFor(() => expect(screen).toHavePathname("/room/new"));
  });

  it("renames and deletes from a press and hold", async () => {
    signedIn();
    mockMe.projects.mockResolvedValue([summary()]);
    mockProjects.rename.mockResolvedValue(room({ name: "Front room" }));
    mockProjects.remove.mockResolvedValue(undefined);
    renderRouter("./app", { initialUrl: "/studio" });
    await waitFor(() => expect(screen.getByText("Living room")).toBeTruthy());
    fireEvent(screen.getByLabelText(/^Living room, Ready to paint/), "longPress");
    await waitFor(() => expect(screen.getByText("Rename")).toBeTruthy());
    press("Rename");
    await waitFor(() => expect(screen.getByText("Rename this room")).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText("Name"), "Front room");
    press("Save");
    await waitFor(() => expect(mockProjects.rename).toHaveBeenCalledWith("p1", "Front room"));

    fireEvent(screen.getByLabelText(/^Living room, Ready to paint/), "longPress");
    await waitFor(() => expect(screen.getByText("Delete room")).toBeTruthy());
    press("Delete room");
    await waitFor(() => expect(screen.getByText(/does not give the room back/)).toBeTruthy());
    pressLast("Delete room");
    await waitFor(() => expect(mockProjects.remove).toHaveBeenCalledWith("p1"));
  });

  it("forgets a deleted room's unsaved colours, so nothing is sent for it again", async () => {
    signedIn();
    mockMe.projects.mockResolvedValue([summary()]);
    mockProjects.remove.mockResolvedValue(undefined);
    initRoom("p1", room(), ["11"]);
    applyColours("p1", { "11": { hex: "#7b8a72", code: "HV0118", lrv: 30 } });
    renderRouter("./app", { initialUrl: "/studio" });
    await waitFor(() => expect(screen.getByText("Living room")).toBeTruthy());
    fireEvent(screen.getByLabelText(/^Living room, Ready to paint/), "longPress");
    await waitFor(() => expect(screen.getByText("Delete room")).toBeTruthy());
    press("Delete room");
    await waitFor(() => expect(screen.getByText(/does not give the room back/)).toBeTruthy());
    pressLast("Delete room");
    await waitFor(() => expect(mockProjects.remove).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(getRoomPaint("p1").pending).toEqual({}));
    await act(async () => jest.advanceTimersByTime(15_000));
    expect(mockProjects.saveColours).not.toHaveBeenCalled();
  });
});

// ── C6–C7 Add photo, Name it ──────────────────────────────────────────────────

describe("C6–C7 · Add photo and name it", () => {
  it("with no room to spend, shows the next step instead of the camera", async () => {
    signedIn();
    mockMe.entitlement.mockResolvedValue(null);
    renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByText("No rooms yet")).toBeTruthy());
    expect(screen.queryByTestId("shutter")).toBeNull();
  });

  it("explains the camera before asking, and points to settings once refused", async () => {
    signedIn();
    mockPermission = { granted: false, canAskAgain: true };
    const view = renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByText("Photograph your room")).toBeTruthy());
    press("Allow the camera");
    expect(mockRequestPermission).toHaveBeenCalled();
    view.unmount();
    mockPermission = { granted: false, canAskAgain: false };
    renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByText("Camera is off for HueVistaa")).toBeTruthy());
    expect(screen.getByText("Open settings")).toBeTruthy();
  });

  it("takes a photo, shrinks it, uploads while the room is named, and creates it", async () => {
    signedIn();
    let finish!: (v: unknown) => void;
    mockUpload.mockImplementation((_file: unknown, onProgress: (n: number) => void) => {
      onProgress(0.4);
      return new Promise((resolve) => (finish = resolve));
    });
    mockProjects.create.mockResolvedValue(room({ id: "p9", status: "CREATED", regions: [] }));
    renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByTestId("shutter")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shutter"));
    await waitFor(() => expect(screen.getByText("Use this photo")).toBeTruthy());
    press("Use this photo");
    await waitFor(() => expect(screen).toHavePathname("/room/details"));
    expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ uri: "file://small.jpg", type: "image/jpeg" }), expect.any(Function));
    expect(screen.getByText("Uploading your photo… 40%")).toBeTruthy();
    expect(screen.getByText("This uses 1 of your 2 rooms.")).toBeTruthy();
    press("Bedroom");
    expect(screen.getByLabelText("Name").props.value).toBe("Bedroom");
    await act(async () => finish({ imageId: "img-1", imageUrl: "/api/images/files/img-1.jpg" }));
    await waitFor(() => expect(screen.getByText("Photo uploaded")).toBeTruthy());
    press("Create");
    await waitFor(() => expect(screen).toHavePathname("/room/p9/tidy"));
    expect(mockProjects.create).toHaveBeenCalledWith({ imageId: "img-1", name: "Bedroom", roomType: "Bedroom" });
  });

  it("says plainly when the photo isn't a room, and offers a retake", async () => {
    signedIn();
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: "file://dog.jpg", width: 1200, height: 900 }] });
    mockUpload.mockRejectedValue(new ApiError("http", 422, "Invalid image"));
    renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByLabelText("Pick from your gallery")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Pick from your gallery"));
    await waitFor(() => expect(screen.getByText("Use this photo")).toBeTruthy());
    press("Use this photo");
    await waitFor(() => expect(screen.getByText(/doesn't look like a room or a house/)).toBeTruthy());
    press("Retake");
    await waitFor(() => expect(screen).toHavePathname("/room/new"));
  });

  it("offers a sample room only when there are ready-made rooms", async () => {
    signedIn();
    mockPermission = { granted: false, canAskAgain: true };
    const view = renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByText("Photograph your room")).toBeTruthy());
    expect(screen.queryByText("Try a sample room")).toBeNull();
    view.unmount();
    queryClient.clear();
    mockLibrary.list.mockResolvedValue([{ slug: "jaipur", title: "Jaipur living room", imageUrl: "/x.jpg" }]);
    renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByText("Try a sample room")).toBeTruthy());
  });

  it("says so when the gallery can't hand a photo over", async () => {
    signedIn();
    mockPermission = { granted: false, canAskAgain: true };
    mockPick.mockRejectedValue(new Error("picker failed"));
    renderRouter("./app", { initialUrl: "/room/new" });
    await waitFor(() => expect(screen.getByLabelText("Pick from your gallery")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Pick from your gallery"));
    await waitFor(() => expect(screen.getByText("That photo couldn't be opened. Try another.")).toBeTruthy());
  });

  it("once the room is made, back from Tidy up leaves the photo steps behind", async () => {
    signedIn();
    mockMe.projects.mockResolvedValue([summary()]);
    mockUpload.mockResolvedValue({ imageId: "img-1", imageUrl: "/api/images/files/img-1.jpg" });
    mockProjects.create.mockResolvedValue(room({ id: "p9", status: "CREATED", regions: [] }));
    mockProjects.get.mockResolvedValue(room({ id: "p9", status: "CREATED", regions: [] }));
    renderRouter("./app", { initialUrl: "/studio" });
    await waitFor(() => expect(screen.getByText("New room")).toBeTruthy());
    press("New room");
    await waitFor(() => expect(screen.getByTestId("shutter")).toBeTruthy());
    fireEvent.press(screen.getByTestId("shutter"));
    await waitFor(() => expect(screen.getByText("Use this photo")).toBeTruthy());
    press("Use this photo");
    await waitFor(() => expect(screen.getByText("Photo uploaded")).toBeTruthy());
    press("Create");
    await waitFor(() => expect(screen).toHavePathname("/room/p9/tidy"));
    act(() => router.back());
    await waitFor(() => expect(screen).toHavePathname("/studio"));
  });

  it("asks for a photo first when Name it is opened without one", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/details" });
    await waitFor(() => expect(screen.getByText("Take or pick a photo first.")).toBeTruthy());
  });
});

// ── CR, C8 ────────────────────────────────────────────────────────────────────

describe("CR · Opening a room at its step", () => {
  it.each([
    ["not cleaned yet", room({ status: "CREATED", regions: [] }), "/room/p1/tidy"],
    ["still working", room({ status: "SEGMENTING", regions: [] }), "/room/p1/tidy"],
    ["ready with no walls", room({ regions: [] }), "/room/p1/adjust"],
    ["ready with walls", room(), "/room/p1/walls"],
    ["view only", room({ readOnly: true }), "/room/p1/paint"],
  ])("%s", async (_name, detail, path) => {
    signedIn();
    mockProjects.get.mockResolvedValue(detail);
    mockProjects.status.mockResolvedValue(detail);
    renderRouter("./app", { initialUrl: "/room/p1" });
    await waitFor(() => expect(screen).toHavePathname(path));

  });

  it("opens on Paint once the room has been painted on this phone", async () => {
    signedIn();
    await AsyncStorage.setItem("hv.paintedRooms", JSON.stringify(["p1"]));
    renderRouter("./app", { initialUrl: "/room/p1" });
    await waitFor(() => expect(screen).toHavePathname("/room/p1/paint"));
  });
});

describe("C8 · Tidy up", () => {
  it("sends the three choices and shows the work", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ status: "CREATED", regions: [], cleanedImageUrl: null }));
    mockProjects.segment.mockResolvedValue(room({ status: "SEGMENTING", regions: [], cleanedImageUrl: null }));
    mockProjects.status.mockResolvedValue(room({ status: "SEGMENTING", regions: [], cleanedImageUrl: null }));
    renderRouter("./app", { initialUrl: "/room/p1/tidy" });
    await waitFor(() => expect(screen.getByText("Empty the room")).toBeTruthy());
    press("Empty the room");
    press("Best view");
    expect(screen.getByText(/match the new view, not your photo/)).toBeTruthy();
    press("Start");
    await waitFor(() => expect(screen.getByText("Clearing the clutter")).toBeTruthy());
    expect(mockProjects.segment).toHaveBeenCalledWith("p1", { maskMode: "AUTO", cleanFurnishing: "EMPTY", cleanAngle: "BEST_VIEW" });
    expect(screen.getByText("Leave this running")).toBeTruthy();
  });

  it("switches to marking walls by hand when automatic finding is unavailable", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ status: "CREATED", regions: [] }));
    mockProjects.segment.mockRejectedValue(new ApiError("http", 402, "No automatic masks left", undefined, "AUTO_MASK_UNAVAILABLE"));
    renderRouter("./app", { initialUrl: "/room/p1/tidy" });
    await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
    press("Start");
    await waitFor(() => expect(screen.getByText(/You can mark the walls yourself — it's free/)).toBeTruthy());
    expect(screen.getByRole("tab", { name: "I'll mark them myself", selected: true })).toBeTruthy();
  });

  it("says a refusal for the room itself as it is, rather than switching to marking by hand", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ status: "CREATED", regions: [] }));
    mockProjects.segment.mockRejectedValue(
      new ApiError("http", 402, "This room's access has ended.", undefined, "SUBSCRIPTION_REQUIRED"),
    );
    renderRouter("./app", { initialUrl: "/room/p1/tidy" });
    await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
    press("Start");
    await waitFor(() => expect(screen.getByText("This room's access has ended.")).toBeTruthy());
    expect(screen.queryByText(/You can mark the walls yourself/)).toBeNull();
    expect(screen.getByRole("tab", { name: "Find them for me", selected: true })).toBeTruthy();
  });

  it("says when a run has gone on far longer than it should, and offers to report it", async () => {
    signedIn();
    const stuck = room({ status: "SEGMENTING", regions: [], cleanedImageUrl: null, updatedAt: "2026-01-01T00:00:00Z" });
    mockProjects.get.mockResolvedValue(stuck);
    mockProjects.status.mockResolvedValue(stuck);
    renderRouter("./app", { initialUrl: "/room/p1/tidy" });
    await waitFor(() => expect(screen.getByText("This is taking much longer than it should")).toBeTruthy());
    expect(screen.queryByText("About 20 seconds", { exact: false })).toBeNull();
    press("Tell us");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/report"));
  });

  it("says what went wrong in plain words, and can try again", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ status: "FAILED", regions: [], failureReason: "REPLICATE_API_TOKEN not configured", failureStage: "MASK" }));
    renderRouter("./app", { initialUrl: "/room/p1/tidy" });
    await waitFor(() => expect(screen.getByTestId("tidy-failure")).toBeTruthy());
    expect(screen.getByText(/couldn't find the walls in this photo/)).toBeTruthy();
    expect(screen.queryByText(/REPLICATE/)).toBeNull();
    press("Try again");
    await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
  });

  it("goes on to the walls when the work is done, or to marking them when there are none", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ autoMaskFailed: true, regions: [], autoMaskNotice: "We couldn't create the custom wall masks." }));
    renderRouter("./app", { initialUrl: "/room/p1/tidy" });
    await waitFor(() => expect(screen).toHavePathname("/room/p1/adjust"));
    expect(screen.getByText("We couldn't create the custom wall masks.")).toBeTruthy();
  });
});

// ── C9, C18 ───────────────────────────────────────────────────────────────────

describe("C9 · Walls found", () => {
  it("lists the walls, takes one out of the plan, and says what the walls are today", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ detectedWallColour: "Ivory", detectedWallHex: "#efe6d6" }));
    renderRouter("./app", { initialUrl: "/room/p1/walls" });
    await waitFor(() => expect(screen.getByText("Main wall")).toBeTruthy());
    expect(screen.getByText("Your walls today: Ivory")).toBeTruthy();
    fireEvent(screen.getByTestId("plan-13"), "valueChange", false);
    await waitFor(() => expect(mockProjects.savePlan).toHaveBeenCalledWith("p1", [{ regionId: 13, inPlan: false }]));
    press("Start painting");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/paint"));
  });

  it("puts a refused plan change back", async () => {
    signedIn();
    mockProjects.savePlan.mockRejectedValue(new ApiError("http", 403, "This room is view only."));
    renderRouter("./app", { initialUrl: "/room/p1/walls" });
    await waitFor(() => expect(screen.getByTestId("plan-12")).toBeTruthy());
    fireEvent(screen.getByTestId("plan-12"), "valueChange", false);
    await waitFor(() => expect(screen.getByText("This room is view only.")).toBeTruthy());
    expect(screen.getByTestId("plan-12").props.value).toBe(true);
  });

  it("puts back only the wall whose change was refused", async () => {
    signedIn();
    let refuse!: (err: unknown) => void;
    mockProjects.savePlan
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (refuse = reject)))
      .mockResolvedValueOnce(undefined);
    renderRouter("./app", { initialUrl: "/room/p1/walls" });
    await waitFor(() => expect(screen.getByTestId("plan-12")).toBeTruthy());
    fireEvent(screen.getByTestId("plan-12"), "valueChange", false);
    fireEvent(screen.getByTestId("plan-13"), "valueChange", false);
    await act(async () => refuse(new ApiError("http", 403, "This room is view only.")));
    await waitFor(() => expect(screen.getByText("This room is view only.")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("plan-13").props.value).toBe(false));
    expect(screen.getByTestId("plan-12").props.value).toBe(true);
  });

  it("says the walls are being redrawn while a report is open", async () => {
    signedIn();
    mockProjects.latestReport.mockResolvedValue({ id: "r1", issues: ["MASK_NOT_GENERATED_PROPERLY"], status: "NEW" });
    renderRouter("./app", { initialUrl: "/room/p1/walls" });
    await waitFor(() => expect(screen.getByText(/We're redrawing these walls/)).toBeTruthy());
  });
});

describe("C18 · The walls are wrong", () => {
  it("needs a tick, then sends the report", async () => {
    signedIn();
    mockProjects.report.mockResolvedValue({ id: "r1", issues: ["IMAGE_NOT_CLEANED_PROPERLY"], status: "NEW" });
    renderRouter("./app", { initialUrl: "/room/p1/report" });
    await waitFor(() => expect(screen.getByText("Send")).toBeTruthy());
    press("Send");
    expect(screen.getByText("Tick at least one.")).toBeTruthy();
    expect(mockProjects.report).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("issue-IMAGE_NOT_CLEANED_PROPERLY"));
    fireEvent.changeText(screen.getByLabelText(/Anything else we should know/), "The sofa melted");
    press("Send");
    await waitFor(() => expect(screen.getByText(/We'll redraw the walls, usually within a day/)).toBeTruthy());
    expect(mockProjects.report).toHaveBeenCalledWith("p1", { issues: ["IMAGE_NOT_CLEANED_PROPERLY"], note: "The sofa melted" });
  });
});

// ── C11–C14 ───────────────────────────────────────────────────────────────────

describe("C11 · Paint", () => {
  it("shows the walls in plan order and saves a colour a moment after it is picked", async () => {
    signedIn();
    pushRecent({ hex: "#7b8a72", code: "HV0118", lrv: 30 });
    renderRouter("./app", { initialUrl: "/room/p1/paint" });
    await waitFor(() => expect(screen.getByTestId("wall-11")).toBeTruthy());
    expect(screen.getByText("Accent wall")).toBeTruthy();
    fireEvent.press(screen.getByTestId("wall-12"));
    await waitFor(() => expect(screen.getByLabelText("Recent: HV0118")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Recent: HV0118"));
    expect(mockProjects.saveColours).not.toHaveBeenCalled();
    await waitFor(() => expect(mockProjects.saveColours).toHaveBeenCalledWith("p1", [{ regionId: 12, shadeCode: "HV0118", hexCode: "#7b8a72" }]), {
      timeout: 2000,
    });
    expect(screen.getByLabelText("Accent wall, HV0118")).toBeTruthy();
  });

  it("undoes the last colour", async () => {
    signedIn();
    pushRecent({ hex: "#7b8a72", code: "HV0118", lrv: 30 });
    renderRouter("./app", { initialUrl: "/room/p1/paint" });
    await waitFor(() => expect(screen.getByLabelText("Recent: HV0118")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Recent: HV0118"));
    await waitFor(() => expect(screen.getByLabelText("Main wall, HV0118")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Undo"));
    await waitFor(() => expect(screen.getByLabelText("Main wall, Not painted")).toBeTruthy());
  });

  it("puts the shade chosen on its own page onto the first wall", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/paint?shade=HV0124&brand=asian-paints" });
    await waitFor(() => expect(screen.getByLabelText("Main wall, HV0124")).toBeTruthy());
    await waitFor(() => expect(mockProjects.saveColours).toHaveBeenCalledWith("p1", [{ regionId: 11, shadeCode: "HV0124", hexCode: "#3e4a52" }]), {
      timeout: 2000,
    });
  });

  it("keeps a colour that failed to save, and says so", async () => {
    signedIn();
    mockProjects.saveColours.mockRejectedValue(new ApiError("network", 0, "offline"));
    renderRouter("./app", { initialUrl: "/room/p1/paint?shade=HV0124" });
    await waitFor(() => expect(screen.getByText(/Your colours aren't saved yet/)).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByLabelText("Main wall, HV0124")).toBeTruthy();
  });

  it("shows a view-only room without letting it change", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ readOnly: true, readOnlyReason: "This room's time has run out." }));
    renderRouter("./app", { initialUrl: "/room/p1/paint" });
    await waitFor(() => expect(screen.getByText("This room's time has run out.")).toBeTruthy());
    expect(screen.queryByText("Browse shades")).toBeNull();
  });

  it("warns when the room closes in a few days", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ accessExpiresAt: new Date(Date.now() + 2.5 * 86_400_000).toISOString() }));
    renderRouter("./app", { initialUrl: "/room/p1/paint" });
    await waitFor(() => expect(screen.getByText("2 days left on this room")).toBeTruthy());
  });

  it("paints a saved colour as its shade, and the backend's opening colour as a real shade", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(
      room({
        regions: [
          region(11, "MAIN_WALL", { appliedHexCode: "#e8d5b0" }),
          region(12, "ACCENT_WALL", { appliedHexCode: "#7b8a72", appliedShadeCode: "HV0118" }),
        ],
      }),
    );
    renderRouter("./app", { initialUrl: "/room/p1/paint" });
    // The opening reference colour, saved with no code, is the opening company's nearest shade.
    await waitFor(() => expect(screen.getByLabelText("Main wall, HV0101")).toBeTruthy());
    expect(screen.getByLabelText("Accent wall, HV0118")).toBeTruthy();
    expect(getRoomPaint("p1").colours["12"]).toEqual({ hex: "#7b8a72", code: "HV0118", lrv: 30 });
  });

  it("asks for a painted wall before saving a combination", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/paint" });
    await waitFor(() => expect(screen.getByText("Save this combination")).toBeTruthy());
    press("Save this combination");
    await waitFor(() => expect(screen.getByText("Paint a wall first, then save the combination.")).toBeTruthy());
    expect(screen.queryByText("That combination is already saved.")).toBeNull();
  });

  it("stops and says why when the server refuses the colours for good", async () => {
    signedIn();
    mockProjects.saveColours.mockRejectedValue(new ApiError("http", 402, "This room's access has ended.", undefined, "SUBSCRIPTION_REQUIRED"));
    renderRouter("./app", { initialUrl: "/room/p1/paint?shade=HV0124" });
    await waitFor(() => expect(screen.getByText("Your last colours couldn't be saved: This room's access has ended.")).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.queryByText(/we'll keep trying/)).toBeNull();
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(mockProjects.saveColours).toHaveBeenCalledTimes(1);
    // Seen once is enough: back on Paint later, it isn't said again.
    act(() => router.push("/room/p1/compare"));
    await waitFor(() => expect(screen).toHavePathname("/room/p1/compare"));
    act(() => router.back());
    await waitFor(() => expect(screen.getByText("Browse shades")).toBeTruthy());
    expect(screen.queryByText(/couldn't be saved/)).toBeNull();
  });

  it("doesn't offer to mark walls on a view-only room that has none", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ readOnly: true, regions: [] }));
    renderRouter("./app", { initialUrl: "/room/p1/paint" });
    await waitFor(() => expect(screen.getByText("This room has no walls yet.")).toBeTruthy());
    expect(screen.queryByText("Mark your walls")).toBeNull();
  });

  it("keeps a combination for the board, once", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/paint?shade=HV0124" });
    await waitFor(() => expect(screen.getByLabelText("Main wall, HV0124")).toBeTruthy());
    press("Save this combination");
    await waitFor(() => expect(screen.getByText("Combination saved.")).toBeTruthy());
    expect(screen.getByLabelText("Saved combinations, 1")).toBeTruthy();
    press("Save this combination");
    await waitFor(() => expect(screen.getByText("That combination is already saved.")).toBeTruthy());
  });
});

describe("C12 · Shade picker", () => {
  it("paints the wall with a tap and stays open", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/shade-picker?projectId=p1&regionId=12" });
    await waitFor(() => expect(screen.getByLabelText("HV0101")).toBeTruthy());
    expect(screen.getByText("For Accent wall")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("HV0101"));
    await waitFor(() => expect(mockProjects.saveColours).toHaveBeenCalledWith("p1", [{ regionId: 12, shadeCode: "HV0101", hexCode: "#e8d5b0" }]), {
      timeout: 2000,
    });
    expect(screen).toHavePathname("/shade-picker");
    expect(screen.getByLabelText("Recent: HV0101")).toBeTruthy();
  });

  it("offers the shop's own picks", async () => {
    signedIn();
    mockMe.shopCombos.mockResolvedValue([{ id: "c1", name: "Warm", shades: [{ code: "HV0118", hex: "#7b8a72" }] }]);
    renderRouter("./app", { initialUrl: "/shade-picker?projectId=p1&regionId=11" });
    await waitFor(() => expect(screen.getByLabelText("Your shop's picks: HV0118")).toBeTruthy());
  });
});

describe("C13 · Suggested palettes", () => {
  const combo = {
    name: "Garden morning",
    rationale: "Soft greens against warm white.",
    primaryHex: "#e8d5b0",
    primaryShade: { shadeCode: "HV0101", hvCode: "HV0101", hexCode: "#e8d5b0" },
    accentHex: "#7b8a72",
    accentShade: { shadeCode: "HV0118", hvCode: "HV0118", hexCode: "#7b8a72" },
    trimHex: "#3e4a52",
    trimShade: { shadeCode: "HV0124", hvCode: "HV0124", hexCode: "#3e4a52" },
  };

  it("puts each colour on the wall it is for, and saves", async () => {
    signedIn();
    mockProjects.suggestions.mockResolvedValue({ projectId: "p1", combinations: [combo] });
    renderRouter("./app", { initialUrl: "/room/p1/suggestions" });
    await waitFor(() => expect(screen.getByText("Garden morning")).toBeTruthy());
    expect(screen.getByText("Soft greens against warm white.")).toBeTruthy();
    press("Try this");
    await waitFor(
      () =>
        expect(mockProjects.saveColours).toHaveBeenCalledWith("p1", [
          { regionId: 11, shadeCode: "HV0101", hexCode: "#e8d5b0" },
          { regionId: 12, shadeCode: "HV0118", hexCode: "#7b8a72" },
          { regionId: 13, shadeCode: "HV0124", hexCode: "#3e4a52" },
        ]),
      { timeout: 2000 },
    );
  });

  it("asks for another set", async () => {
    signedIn();
    mockProjects.suggestions.mockResolvedValue({ projectId: "p1", combinations: [combo] });
    renderRouter("./app", { initialUrl: "/room/p1/suggestions" });
    await waitFor(() => expect(screen.getByText("Suggest again")).toBeTruthy());
    press("Suggest again");
    await waitFor(() => expect(mockProjects.suggestions).toHaveBeenCalledWith("p1", 1));
  });

  it("says a closed room can't take suggestions", async () => {
    signedIn();
    mockProjects.suggestions.mockRejectedValue(new ApiError("http", 402, "Access window closed"));
    renderRouter("./app", { initialUrl: "/room/p1/suggestions" });
    await waitFor(() => expect(screen.getByText(/This room has closed/)).toBeTruthy());
  });
});

describe("C14 · Before and after", () => {
  it("opens the comparison", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/compare" });
    await waitFor(() => expect(screen.getByText("Share this view")).toBeTruthy());
  });
});

// ── C10 ───────────────────────────────────────────────────────────────────────

describe("C10 · Adjust walls", () => {
  it("adds a new wall of the kind chosen", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/adjust" });
    await waitFor(() => expect(screen.getByTestId("adjust-new-wall")).toBeTruthy());
    fireEvent.press(screen.getByTestId("adjust-new-wall"));
    await waitFor(() => expect(screen.getByText("What is this wall?")).toBeTruthy());
    pressLast("Ceiling");
    await waitFor(() => expect(screen.getByLabelText("Delete this wall")).toBeTruthy());
    expect(screen.getAllByText("Ceiling").length).toBeGreaterThan(0);
  });

  it("goes on to Paint when nothing was changed", async () => {
    signedIn();
    renderRouter("./app", { initialUrl: "/room/p1/adjust" });
    await waitFor(() => expect(screen.getByText("Done")).toBeTruthy());
    press("Done");
    await waitFor(() => expect(screen).toHavePathname("/room/p1/paint"));
    expect(mockProjects.replaceMask).not.toHaveBeenCalled();
  });

  it("leaves a ready-made room's walls as they are", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ fromLibrary: true }));
    renderRouter("./app", { initialUrl: "/room/p1/adjust" });
    await waitFor(() => expect(screen.getByText(/ready-made room: its walls are already marked/)).toBeTruthy());
    expect(screen.queryByTestId("adjust-new-wall")).toBeNull();
  });

  it("with no walls yet, asks for the first one", async () => {
    signedIn();
    mockProjects.get.mockResolvedValue(room({ regions: [] }));
    renderRouter("./app", { initialUrl: "/room/p1/adjust" });
    await waitFor(() => expect(screen.getByText("No walls yet. Add your first one.")).toBeTruthy());
  });
});
