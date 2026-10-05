/**
 * A8's resend waits thirty seconds after the first code. This file runs on Jest's fake
 * clock from start to finish (switching clocks part-way through a file leaves timers
 * behind that hang the next test's clean-up).
 */
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { ApiError } from "@/api/errors";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockResend = jest.fn();
const mockConfirm = jest.fn();
jest.mock("@/api/endpoints/auth", () => ({
  authApi: {
    profile: jest.fn(),
    logout: jest.fn(async () => undefined),
    shopEmailCode: (body: unknown) => mockConfirm(body),
    shopEmailCodeResend: (challenge: string) => mockResend(challenge),
  },
}));

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

it("waits thirty seconds, then sends a new code and uses the new challenge", async () => {
  mockResend.mockResolvedValue({ emailCodeRequired: true, challengeToken: "ch-2", emailHint: "s***@example.com" });
  mockConfirm.mockRejectedValue(new ApiError("http", 400, "Incorrect code."));
  renderRouter("./app", { initialUrl: "/email-code?challenge=ch-1" });
  await waitFor(() => expect(screen.getByText("We emailed a code to the shop's address.")).toBeTruthy());
  expect(screen.getByText("Resend in 0:30")).toBeTruthy();

  for (let s = 0; s < 30; s++) act(() => jest.advanceTimersByTime(1000));
  await waitFor(() => expect(screen.getByText("Send a new code")).toBeTruthy());
  fireEvent.press(screen.getByText("Send a new code"));
  await waitFor(() => expect(screen.getByText("We emailed a code to s***@example.com.")).toBeTruthy());
  expect(mockResend).toHaveBeenCalledWith("ch-1");
  expect(screen.getByText("Resend in 0:30")).toBeTruthy();

  fireEvent.changeText(screen.getByTestId("shop-code-input"), "111111");
  await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith({ challengeToken: "ch-2", code: "111111" }));
  await waitFor(() => expect(screen.getByText("Incorrect code.")).toBeTruthy());
});
