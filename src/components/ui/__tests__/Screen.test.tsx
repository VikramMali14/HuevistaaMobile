import { useNetInfo, type NetInfoState } from "@react-native-community/netinfo";
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Screen } from "../Screen";

const netInfo = jest.mocked(useNetInfo);
const OFFLINE_TEXT = "You're offline. Showing what was saved.";

function connection(isConnected: boolean | null) {
  netInfo.mockReturnValue({ isConnected } as NetInfoState);
}

describe("Screen", () => {
  afterEach(() => connection(true));

  it("shows no offline bar while connected", () => {
    connection(true);
    render(<Screen><Text>Body</Text></Screen>);
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
  });

  it("shows the offline bar IN the page, above the content, when offline (X1)", async () => {
    connection(false);
    render(<Screen><Text>Body</Text></Screen>);
    // The bar's icon loads its font asynchronously; let that settle inside act().
    await act(async () => {});
    expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("says nothing while the connection is still unknown", () => {
    connection(null);
    render(<Screen><Text>Body</Text></Screen>);
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
  });

  it("lets a full-bleed canvas screen turn the bar off", () => {
    connection(false);
    render(<Screen offlineBanner={false}><Text>Canvas</Text></Screen>);
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
  });
});
