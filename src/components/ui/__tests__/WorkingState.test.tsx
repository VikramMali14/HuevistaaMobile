import { render, screen } from "@testing-library/react-native";

import { formatElapsed, WorkingState } from "../WorkingState";
import { StepDots } from "../StepDots";

describe("WorkingState", () => {
  it("prints elapsed time as minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(42.9)).toBe("0:42");
    expect(formatElapsed(125)).toBe("2:05");
    expect(formatElapsed(-3)).toBe("0:00");
  });

  it("names the stage, says what it does, and offers to leave it running", () => {
    const onLeave = jest.fn();
    render(<WorkingState stage="Finding your walls" sentence="Working out where each wall is." estimate="About a minute" startedAt={Date.now()} onLeave={onLeave} />);
    expect(screen.getByText("Finding your walls")).toBeTruthy();
    expect(screen.getByText(/About a minute · 0:0\d so far/)).toBeTruthy();
    expect(screen.getByText("Leave this running")).toBeTruthy();
  });
});

describe("StepDots", () => {
  it("labels only the current step, and says where it is", () => {
    render(<StepDots current="adjust" />);
    expect(screen.getByText("Adjust")).toBeTruthy();
    expect(screen.queryByText("Apply colour")).toBeNull();
    expect(screen.getByLabelText("Step 4 of 5: Adjust")).toBeTruthy();
  });
});
