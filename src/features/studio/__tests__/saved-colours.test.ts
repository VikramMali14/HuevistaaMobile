import type { PaintShade } from "@/lib/shade-types";

import { pickOpeningBrand, savedColour } from "../saved-colours";

const shade = (code: string, hex: string, brand: string, lrv: number): PaintShade => ({
  code,
  hvCode: code,
  name: code,
  hex,
  family: "",
  lrv,
  brand,
  finishes: [],
});

// Two companies; the Asian Paints shades nearest the backend's exterior opening colours.
const catalogue = [
  shade("HV0001", "#e6d3ae", "Asian Paints", 68), // near Cashmere Beige #e8d5b0
  shade("HV0002", "#ae5f3f", "Asian Paints", 18), // near Burnt Sienna #b0603e
  shade("HV0003", "#4b372b", "Asian Paints", 6), // near Dark Clove #4a362a
  shade("HV0004", "#fbfbf8", "Asian Paints", 91), // a white
  shade("HV0100", "#e8d5b0", "Berger", 70), // the exact opening hex, another company
  shade("HV0101", "#7b8a72", "Berger", 30),
  shade("HV0102", "#7c8b73", "Berger", 31),
];
const scheme = {};

describe("a wall's saved colour, as the studio paints it", () => {
  it("is nothing for a wall never painted", () => {
    expect(savedColour({ category: "MAIN_WALL" }, catalogue, scheme)).toBeNull();
  });

  it("finds the shade again by its saved code, for its LRV", () => {
    expect(savedColour({ category: "MAIN_WALL", appliedHexCode: "#7b8a72", appliedShadeCode: "HV0101" }, catalogue, scheme)).toEqual({
      hex: "#7b8a72",
      code: "HV0101",
      lrv: 30,
    });
  });

  it("finds the shade by its exact hex when no code was saved", () => {
    expect(savedColour({ category: "OTHER_WALL", appliedHexCode: "#7C8B73" }, catalogue, scheme)).toEqual({
      hex: "#7C8B73",
      code: "HV0102",
      lrv: 31,
    });
  });

  it("keeps a code the catalogue doesn't have, painting its hex as it is", () => {
    expect(savedColour({ category: "MAIN_WALL", appliedHexCode: "#123456", appliedHvCode: "HV9999" }, catalogue, scheme)).toEqual({
      hex: "#123456",
      code: "HV9999",
      lrv: null,
    });
  });

  it("snaps a found wall still on its opening colour to the nearest shade of the opening company", () => {
    // Exterior opening colours, no code saved: Asian Paints' nearest, not Berger's exact hex.
    expect(savedColour({ category: "MAIN_WALL", appliedHexCode: "#e8d5b0" }, catalogue, scheme)).toEqual({
      hex: "#e6d3ae",
      code: "HV0001",
      lrv: 68,
    });
    expect(savedColour({ category: "ACCENT_WALL", appliedHexCode: "#B0603E" }, catalogue, scheme)?.code).toBe("HV0002");
    expect(savedColour({ category: "TRIM", appliedHexCode: "#4a362a" }, catalogue, scheme)?.code).toBe("HV0003");
    // Indoors everything opens white; a ceiling's white is its opening colour too.
    expect(savedColour({ category: "CEILING", appliedHexCode: "#ffffff" }, catalogue, scheme)?.code).toBe("HV0004");
  });

  it("leaves a colour the customer chose alone, even when it is an opening hex", () => {
    expect(savedColour({ category: "MAIN_WALL", appliedHexCode: "#e8d5b0", appliedShadeCode: "HV0100" }, catalogue, scheme)?.code).toBe(
      "HV0100",
    );
  });

  it("doesn't snap a wall drawn by hand", () => {
    expect(savedColour({ category: "MANUAL", appliedHexCode: "#ffffff" }, catalogue, scheme)).toEqual({ hex: "#ffffff", code: null, lrv: null });
  });

  it("takes the opening company from what this account can see", () => {
    expect(pickOpeningBrand(catalogue)).toBe("Asian Paints");
    const shopOnly = catalogue.filter((s) => s.brand === "Berger");
    expect(pickOpeningBrand(shopOnly)).toBe("Berger");
    expect(savedColour({ category: "MAIN_WALL", appliedHexCode: "#e8d5b0" }, shopOnly, scheme)?.code).toBe("HV0100");
    expect(pickOpeningBrand([])).toBeUndefined();
  });
});
