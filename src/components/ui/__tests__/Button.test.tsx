import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button } from "../Button";

describe("Button", () => {
  it("shows its label and calls onPress", () => {
    const onPress = jest.fn();
    render(<Button label="Send code" onPress={onPress} />);

    fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("cannot be pressed while loading, and says it is busy", () => {
    const onPress = jest.fn();
    render(<Button label="Pay" onPress={onPress} loading />);

    const button = screen.getByRole("button", { name: "Pay" });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });

  it("cannot be pressed when disabled", () => {
    const onPress = jest.fn();
    render(<Button label="Continue" onPress={onPress} disabled />);

    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
