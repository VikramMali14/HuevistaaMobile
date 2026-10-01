import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button } from "../Button";

// Testing Library 14: render and fireEvent are async.
describe("Button", () => {
  it("shows its label and calls onPress", async () => {
    const onPress = jest.fn();
    await render(<Button label="Send code" onPress={onPress} />);

    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("cannot be pressed while loading, and says it is busy", async () => {
    const onPress = jest.fn();
    await render(<Button label="Pay" onPress={onPress} loading />);

    const button = screen.getByRole("button", { name: "Pay" });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });

  it("cannot be pressed when disabled", async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
