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
