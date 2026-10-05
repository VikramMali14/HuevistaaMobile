import { act, render, screen } from "@testing-library/react-native";
import { Image } from "expo-image";

import { RemoteImage } from "../RemoteImage";

jest.mock("@/config/env", () => ({ env: { apiOrigin: "https://api.test" } }));

describe("RemoteImage", () => {
  it("shows a quiet icon when a picture fails, and tries a new picture afresh", () => {
    const { rerender } = render(<RemoteImage url="https://cdn.test/a.jpg" />);
    act(() => screen.UNSAFE_getByType(Image).props.onError?.({ error: "404" }));
    expect(screen.UNSAFE_queryByType(Image)).toBeNull();
    rerender(<RemoteImage url="https://cdn.test/b.jpg" />);
    expect(screen.UNSAFE_getByType(Image).props.source).toEqual({ uri: "https://cdn.test/b.jpg" });
  });
});
