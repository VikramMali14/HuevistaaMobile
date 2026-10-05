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

// Pinch-to-zoom (ZoomView): the libraries' own test doubles — gestures never fire in
// Jest, and the zoomed view renders as a plain one.
require("react-native-gesture-handler/jestSetup");
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
