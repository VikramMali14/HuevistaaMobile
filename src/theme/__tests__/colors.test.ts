import { dark, light, type Palette } from "../colors";

/** WCAG 2.x contrast. rgba() is blended over the ground it sits on. */
function rgb(color: string, under?: string): [number, number, number] {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = color.match(/rgba?\(([^)]+)\)/)![1]!.split(",").map(Number);
  const alpha = parts[3] ?? 1;
  const base = under ? rgb(under) : [0, 0, 0];
  return [0, 1, 2].map((i) => Math.round(parts[i]! * alpha + base[i]! * (1 - alpha))) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(rgb(fg, bg)), luminance(rgb(bg))].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}

const themes: [string, Palette][] = [
  ["dark", dark],
  ["light", light],
];

const textTokens = ["fg", "fgSoft", "fgMute", "accentText", "warmText", "dangerText", "successText"] as const;
const grounds = ["bg", "surface", "surfaceSoft"] as const;

describe.each(themes)("%s palette", (_name, c) => {
  it.each(textTokens.flatMap((t) => grounds.map((g) => [t, g] as const)))(
    "%s is readable on %s (≥ 4.5:1)",
    (text, ground) => {
      expect(contrast(c[text], c[ground])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("brass carries ink at 6.2:1, as on the website", () => {
    expect(contrast(c.accentOn, c.accent)).toBeCloseTo(6.2, 1);
  });

  it("the destructive button's white text is readable on the warm fill", () => {
    expect(contrast("#ffffff", c.warmFill)).toBeGreaterThanOrEqual(4.5);
  });

  it("ivory is readable on the danger and success fills", () => {
    expect(contrast(c.ivory, c.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.ivory, c.success)).toBeGreaterThanOrEqual(4.5);
  });

  it("a focused field's ink border stands out from the field (≥ 3:1)", () => {
    expect(contrast(c.fg, c.surface)).toBeGreaterThanOrEqual(3);
  });

  it("placeholders are readable in a field", () => {
    expect(contrast(c.fgMuteDeep, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("the brand mark stands out from the page", () => {
    expect(contrast(c.mark, c.bg)).toBeGreaterThanOrEqual(3);
  });
});

describe("one brass for both themes", () => {
  it("strikes the fill once — only the cut that carries words changes", () => {
    expect(dark.accent).toBe(light.accent);
    expect(dark.accentOn).toBe(light.accentOn);
    expect(dark.accentText).not.toBe(light.accentText);
  });

  it("never uses brass itself as text on paper (it is 2.7:1 there)", () => {
    expect(contrast(light.accent, light.bg)).toBeLessThan(3);
    expect(light.accentText).not.toBe(light.accent);
  });
});
