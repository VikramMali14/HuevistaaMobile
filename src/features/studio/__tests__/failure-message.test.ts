import {
  cleanFailedMessage,
  isPresentable,
  maskFailedMessage,
  presentableFailure,
  runFailedMessage,
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
      expect(presentableFailure(raw)).toBe(runFailedMessage());
    }
  });

  it("falls back by the stage that failed", () => {
    expect(presentableFailure("REPLICATE_API_TOKEN not configured", "CLEAN")).toBe(cleanFailedMessage());
    expect(presentableFailure(null, "MASK")).toBe(maskFailedMessage());
    expect(presentableFailure(undefined, null)).toBe(runFailedMessage());
    expect(presentableFailure("   ", "UNKNOWN")).toBe(runFailedMessage());
  });

  it("tells the customer a retry does not cost another room", () => {
    for (const m of [runFailedMessage(), cleanFailedMessage(), maskFailedMessage()]) {
      expect(m).toMatch(/won't use another room/);
    }
  });
});
