import {
  formatMobileForDisplay,
  isIndianMobile,
  normalizeShopCode,
  shopCodeFromText,
  toE164India,
  validateEmail,
  validateName,
  validateNewPassword,
  validateShopCode,
} from "../validation";

describe("Indian mobile numbers", () => {
  it.each(["9876543210", "98765 43210", "+91 98765-43210", "09876543210", "919876543210"])(
    "accepts %s",
    (value) => {
      expect(isIndianMobile(value)).toBe(true);
      expect(toE164India(value)).toBe("+919876543210");
    },
  );

  it.each(["12345", "5876543210", "98765432101", "abcdefghij"])("rejects %s", (value) => {
    expect(isIndianMobile(value)).toBe(false);
  });

  it("groups digits 5-5 for display", () => {
    expect(formatMobileForDisplay("9876543210")).toBe("98765 43210");
    expect(formatMobileForDisplay("987")).toBe("987");
  });
});

describe("other fields", () => {
  it("checks email shape", () => {
    expect(validateEmail("priya@example.com")).toBeNull();
    expect(validateEmail("priya@example")).toBe("validation.email");
  });

  it("follows the backend's password rule", () => {
    expect(validateNewPassword("short1")).toBe("validation.passwordLength");
    expect(validateNewPassword("onlyletters")).toBe("validation.passwordMix");
    expect(validateNewPassword("paint4walls")).toBeNull();
  });

  it("accepts an 8-character shop code in any case", () => {
    expect(normalizeShopCode(" 7k2nq9px ")).toBe("7K2NQ9PX");
    expect(validateShopCode("7k2nq9px")).toBeNull();
    expect(validateShopCode("7K2NQ9")).toBe("validation.shopCode");
  });
});

describe("validateName", () => {
  it("wants at least two letters, ignoring spaces around", () => {
    expect(validateName("")).toBe("validation.nameRequired");
    expect(validateName("   ")).toBe("validation.nameRequired");
    expect(validateName(" P ")).toBe("validation.nameShort");
    expect(validateName("Al")).toBeNull();
  });
});

describe("shopCodeFromText", () => {
  it("cleans a typed code", () => {
    expect(shopCodeFromText("7k2n-q9px")).toBe("7K2NQ9PX");
    expect(shopCodeFromText("7k2")).toBe("7K2");
  });

  it("finds the code in a pasted WhatsApp message", () => {
    expect(shopCodeFromText("Your HueVistaa code: 7K2NQ9PX. Open huevistaa.com/unlock and sign in")).toBe("7K2NQ9PX");
    expect(shopCodeFromText("Use 7K2NQ9PX at huevistaa.com")).toBe("7K2NQ9PX");
  });
});
