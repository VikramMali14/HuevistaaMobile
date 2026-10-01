import { render, screen } from "@testing-library/react-native";

import { dark, light, type Palette } from "@/theme";

import { Em, Text } from "../Text";

// Drive the phone's light/dark setting from the test.
const mockScheme = jest.fn<"light" | "dark", []>(() => "dark");
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockScheme(),
}));

const styleOf = (text: string) =>
  Object.assign({}, ...(screen.getByText(text).props.style as object[]).flat().filter(Boolean)) as Record<
    string,
    unknown
  >;

describe.each<["dark" | "light", Palette]>([
  ["dark", dark],
  ["light", light],
])("Text in the %s theme", (scheme, palette) => {
  beforeEach(() => mockScheme.mockReturnValue(scheme));

  it("uses the website's default ink for each role", () => {
    render(
      <>
        <Text>Body</Text>
        <Text variant="lead">Lead</Text>
        <Text variant="label">Eyebrow</Text>
        <Text variant="fieldLabel">Field</Text>
      </>,
    );
    expect(styleOf("Body").color).toBe(palette.fg);
    expect(styleOf("Lead").color).toBe(palette.fgSoft);
    expect(styleOf("Eyebrow").color).toBe(palette.fgMute);
    expect(styleOf("Field").color).toBe(palette.fgSoft);
  });

  it("lets an explicit tone win — brass text uses the cut that can carry words", () => {
    render(
      <Text variant="label" tone="accent">
        Brass
      </Text>,
    );
    expect(styleOf("Brass").color).toBe(palette.accentText);
  });

  it("sets the emphasised word in the serif italic, soft ink, 1.06×", () => {
    render(
      <Text variant="display">
        Keep your <Em variant="display">colours</Em>
      </Text>,
    );
    const style = styleOf("colours");
    expect(style).toMatchObject({
      fontFamily: "InstrumentSerif_400Regular_Italic",
      color: palette.fgSoft,
      letterSpacing: 0,
    });
    expect(style.fontSize).toBeCloseTo(34 * 1.06);
  });
});
