import {
  CLEAN_FAILED_MESSAGE,
  MASK_FAILED_MESSAGE,
  RUN_FAILED_MESSAGE,
  isPresentable,
  presentableFailure,
} from "../failure-message";

describe("presentableFailure", () => {
  it("passes a sentence written for the customer through unchanged", () => {
    const underLoad =
      "Our image system is under heavy load right now, so we couldn't clean your photo — every model we ask is full. Nothing has been charged. Please try again in a few minutes; your photo is saved and ready to run.";
    expect(presentableFailure(underLoad, "CLEAN")).toBe(underLoad);
    expect(presentableFailure("Your image couldn't be made just now. Your credit is back — please try again."))
      .toBe("Your image couldn't be made just now. Your credit is back — please try again.");
  });

  it("never shows a setting's name, an exception or a raw wrapper", () => {
    for (const raw of [
      "REPLICATE_API_TOKEN not configured",
      "Segmentation failed: Read timed out",
      "Segmentation failed: java.io.IOException: Could not decode image bytes",
      "Project owner not found",
      "NullPointerException at com.gridstore.huevista.Foo.bar(Foo.java:12)",
      "Premium image could not be produced. (black-forest-labs/flux-2-klein: status 422)",
      '{"error":"bad gateway"}',
    ]) {
      expect({ raw, presentable: isPresentable(raw) }).toEqual({ raw, presentable: false });
      expect(presentableFailure(raw)).toBe(RUN_FAILED_MESSAGE);
    }
  });

  it("falls back by the stage that failed", () => {
    expect(presentableFailure("REPLICATE_API_TOKEN not configured", "CLEAN")).toBe(CLEAN_FAILED_MESSAGE);
    expect(presentableFailure(null, "MASK")).toBe(MASK_FAILED_MESSAGE);
    expect(presentableFailure(undefined, null)).toBe(RUN_FAILED_MESSAGE);
    expect(presentableFailure("   ", "UNKNOWN")).toBe(RUN_FAILED_MESSAGE);
  });

  it("tells the customer a retry does not cost another room", () => {
    for (const m of [RUN_FAILED_MESSAGE, CLEAN_FAILED_MESSAGE, MASK_FAILED_MESSAGE]) {
      expect(m).toMatch(/won't use another room/);
    }
  });
});
