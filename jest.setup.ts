/**
 * Jest setup: the official in-memory mocks for native modules that have no JavaScript
 * fallback. Each library ships its own mock for exactly this purpose.
 *
 * jest.mock() factories run before imports are set up, so they must load the mock with
 * require() — that is Jest's documented pattern, hence the lint exception.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@react-native-community/netinfo", () =>
  require("@react-native-community/netinfo/jest/netinfo-mock.js"),
);

jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

// FlashList measures its window before drawing any row, which never happens in Jest (and
// its own jestSetup points at an export this version does not have). FlatList takes the
// same props, so tests render every row through it.
jest.mock("@shopify/flash-list", () => ({ FlashList: require("react-native").FlatList }));

// Jest has no GPU. The live room renders as an empty view; tests cover everything
// around it, and the engine's own maths is unit-tested without a context.
jest.mock("expo-gl", () => ({ GLView: require("react-native").View }));

// The gesture root (app/_layout.tsx) through the library's own test double. Pinch-to-zoom
// never fires in Jest, so the zoom container renders its content as it is — like the
// GPU canvas above, what is tested is everything around it.
require("react-native-gesture-handler/jestSetup");
jest.mock("@/components/ui/ZoomView", () => ({ ZoomView: ({ children }: { children: unknown }) => children }));

// The board reader (P7) runs pdf.js in a WebView, which Jest has no browser for: the
// WebView is an empty view here, and the 2 MB page it would load is left out. The reading
// itself is proved in Chromium (scripts/verify-board-reader.mjs); the conversation with
// it is unit-tested (board-reader-protocol.test.ts).
jest.mock("react-native-webview", () => {
  const { forwardRef, useImperativeHandle } = require("react");
  const { View } = require("react-native");
  const WebView = forwardRef(function WebView(props: Record<string, unknown>, ref: unknown) {
    useImperativeHandle(ref, () => ({ postMessage: () => {}, injectJavaScript: () => {} }));
    return require("react").createElement(View, { testID: props.testID ?? "webview" });
  });
  return { __esModule: true, WebView, default: WebView };
});
jest.mock("@/features/painter/board-reader/reader-html.generated", () => ({ READER_HTML: "<!doctype html>", READER_INPUTS: {} }));
