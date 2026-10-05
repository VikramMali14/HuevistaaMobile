/**
 * Phase 1 through the REAL route tree: every sign-in path (A2–A9), the first run
 * (A10–A11), the web-only screen (S10) and the return to a page opened before sign-in
 * (A1). Only the network, the secure store and the system browser are faked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as WebBrowser from "expo-web-browser";

import type { AuthResponse, UserProfile } from "@/api/types";
import { ApiError } from "@/api/errors";
import { forgetRememberedRoute } from "@/auth/pending-route";

const mockSecure: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecure[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecure[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecure[key];
  }),
}));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: jest.fn(async () => ({ type: "opened" })),
}));

const mockAuth = {
  profile: jest.fn<Promise<UserProfile>, []>(),
  logout: jest.fn(async () => undefined),
  phoneStart: jest.fn(),
  phoneVerify: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  shopEmailCode: jest.fn(),
  shopEmailCodeResend: jest.fn(),
  exchangeGoogleCode: jest.fn(),
  forgotPassword: jest.fn(async () => ({})),
  forgotPasswordByPhone: jest.fn(async () => ({})),
  resetPassword: jest.fn(async () => ({})),
  resetPasswordByPhone: jest.fn(async () => ({})),
  updateProfile: jest.fn(),
  welcomeSeen: jest.fn(),
  switchProfile: jest.fn(),
};
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));

const mockBecomePainter = jest.fn();
jest.mock("@/api/endpoints/painter", () => ({ painterApi: { becomePainter: () => mockBecomePainter() } }));

const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;

function person(extra: Partial<UserProfile> = {}): UserProfile {
  return { id: "u1", name: "Priya", provider: "LOCAL", role: "CUSTOMER", ...extra };
}

/** What every sign-in endpoint answers once it is happy. */
const tokensFor = (refresh = "refresh-1"): AuthResponse => ({ accessToken: "access-1", refreshToken: refresh });

/** The profile the app will load right after the next sign-in. */
function willSignInAs(profile: UserProfile) {
  mockAuth.profile.mockResolvedValue(profile);
}

function signedInAs(profile: UserProfile) {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue(profile);
}

const press = (text: string | RegExp) => fireEvent.press(screen.getByText(text));
const type = (label: string | RegExp, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  for (const fn of Object.values(mockAuth)) fn.mockReset();
  mockAuth.logout.mockResolvedValue(undefined);
  mockBecomePainter.mockReset();
  openAuthSession.mockReset();
  forgetRememberedRoute();
  await AsyncStorage.clear();
});

describe("A2 · Welcome", () => {
  it("offers the mobile number first, then Google, then email", async () => {
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("Continue with mobile number")).toBeTruthy());
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.getByText("Use email instead")).toBeTruthy();
    press("Continue with mobile number");
    await waitFor(() => expect(screen).toHavePathname("/phone"));
  });

  it("signs in with Google and goes home", async () => {
    openAuthSession.mockResolvedValue({ type: "success", url: "huevista://sign-in/callback#code=g-123" });
    mockAuth.exchangeGoogleCode.mockResolvedValue(tokensFor());
    willSignInAs(person());
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
    press("Continue with Google");
    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAuth.exchangeGoogleCode).toHaveBeenCalledWith("g-123", undefined);
    expect(mockSecure["hv.refresh"]).toBe("refresh-1");
  });

  it("says nothing when the person closes the browser", async () => {
    openAuthSession.mockResolvedValue({ type: "cancel" });
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
    press("Continue with Google");
    await waitFor(() => expect(openAuthSession).toHaveBeenCalled());
    expect(screen.queryByText(/didn't finish/)).toBeNull();
    expect(screen).toHavePathname("/welcome");
  });

  it("says Google did not finish when the code is refused", async () => {
    openAuthSession.mockResolvedValue({ type: "success", url: "huevista://sign-in/callback#code=used" });
    mockAuth.exchangeGoogleCode.mockRejectedValue(new ApiError("http", 401, "Code invalid"));
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
    press("Continue with Google");
    await waitFor(() => expect(screen.getByText("Google sign-in didn't finish. Try again.")).toBeTruthy());
  });
});

describe("A3–A4 · mobile number and code", () => {
  it("texts a code to the number in +91 form and shows where it went", async () => {
    mockAuth.phoneStart.mockResolvedValue({ phone: "*********3210", expiresInSeconds: 300, resendAfterSeconds: 30 });
    renderRouter("./app", { initialUrl: "/phone" });
    await waitFor(() => expect(screen.getByText("Your mobile number")).toBeTruthy());
    type(/Mobile number/, "98765 43210");
    press("Send code");
    await waitFor(() => expect(screen).toHavePathname("/phone-code"));
    expect(mockAuth.phoneStart).toHaveBeenCalledWith("+919876543210");
    expect(screen.getByText("We texted a code to *********3210.")).toBeTruthy();
    expect(screen.getByText("Resend in 0:30")).toBeTruthy();
  });

  it("does not send a code to something that is not a mobile number", async () => {
    renderRouter("./app", { initialUrl: "/phone" });
    await waitFor(() => expect(screen.getByText("Your mobile number")).toBeTruthy());
    type(/Mobile number/, "5123456789");
    expect(screen.getByText(/Enter a 10-digit mobile number/)).toBeTruthy();
    press("Send code");
    expect(mockAuth.phoneStart).not.toHaveBeenCalled();
  });

  it("signs in on the sixth digit — a new number goes to About you", async () => {
    mockAuth.phoneVerify.mockResolvedValue(tokensFor());
    willSignInAs(person({ namePending: true, welcomePending: true }));
    renderRouter("./app", {
      initialUrl: "/phone-code?phone=%2B919876543210&masked=*********3210&resendAfter=30",
    });
    await waitFor(() => expect(screen.getByText("Enter the code")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("phone-code-input"), "123456");
    await waitFor(() => expect(screen).toHavePathname("/about-you"));
    expect(mockAuth.phoneVerify).toHaveBeenCalledWith({ phone: "+919876543210", code: "123456", deviceToken: undefined });
  });

  it("shows the server's reason for a wrong code and clears the boxes", async () => {
    mockAuth.phoneVerify.mockRejectedValue(new ApiError("http", 400, "Incorrect code. 2 attempts left."));
    renderRouter("./app", { initialUrl: "/phone-code?phone=%2B919876543210&resendAfter=30" });
    await waitFor(() => expect(screen.getByText("Enter the code")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("phone-code-input"), "000000");
    await waitFor(() => expect(screen.getByText("Incorrect code. 2 attempts left.")).toBeTruthy());
    expect(screen.getByTestId("phone-code-input").props.value).toBe("");
  });

  it("sends admins to the website", async () => {
    mockAuth.phoneVerify.mockResolvedValue({ twoFactorRequired: true });
    renderRouter("./app", { initialUrl: "/phone-code?phone=%2B919876543210&resendAfter=30" });
    await waitFor(() => expect(screen.getByText("Enter the code")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("phone-code-input"), "123456");
    await waitFor(() => expect(screen.getByText("Admin accounts sign in on the website")).toBeTruthy());
    expect(screen).toHavePathname("/phone-code");
  });

  it("sends a new code once the server's wait is over", async () => {
    mockAuth.phoneStart.mockResolvedValue({ phone: "*********3210", expiresInSeconds: 300, resendAfterSeconds: 45 });
    renderRouter("./app", { initialUrl: "/phone-code?phone=%2B919876543210&resendAfter=0" });
    await waitFor(() => expect(screen.getByText("Send a new code")).toBeTruthy());
    press("Send a new code");
    await waitFor(() => expect(screen.getByText("A new code is on its way.")).toBeTruthy());
    expect(mockAuth.phoneStart).toHaveBeenCalledWith("+919876543210");
    expect(screen.getByText("Resend in 0:45")).toBeTruthy();
  });
});

describe("A5 · email sign-in", () => {
  async function signInWith(email: string, password: string) {
    renderRouter("./app", { initialUrl: "/email-sign-in" });
    await waitFor(() => expect(screen.getByText("Sign in with email")).toBeTruthy());
    type("Email", email);
    type("Password", password);
    press("Sign in");
  }

  it("signs in and goes home", async () => {
    mockAuth.login.mockResolvedValue(tokensFor());
    willSignInAs(person());
    await signInWith("priya@example.com", "secret123");
    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAuth.login).toHaveBeenCalledWith({ email: "priya@example.com", password: "secret123", deviceToken: undefined });
  });

  it("keeps the password hidden until Show", async () => {
    renderRouter("./app", { initialUrl: "/email-sign-in" });
    await waitFor(() => expect(screen.getByText("Sign in with email")).toBeTruthy());
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText("Show Password"));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
  });

  it("gives one sentence for a wrong password or an unknown email", async () => {
    mockAuth.login.mockRejectedValue(new ApiError("http", 401, "Bad credentials"));
    await signInWith("priya@example.com", "wrong");
    await waitFor(() => expect(screen.getByText("That email and password don't match.")).toBeTruthy());
  });

  it("takes a shop on a new device to its emailed code", async () => {
    mockAuth.login.mockResolvedValue({ emailCodeRequired: true, challengeToken: "ch-1", emailHint: "s***@example.com" });
    await signInWith("shop@example.com", "secret123");
    await waitFor(() => expect(screen).toHavePathname("/email-code"));
    expect(screen.getByText("We emailed a code to s***@example.com.")).toBeTruthy();
  });

  it("starts with the email a previous screen handed over", async () => {
    renderRouter("./app", { initialUrl: "/email-sign-in?email=priya%40example.com" });
    await waitFor(() => expect(screen.getByLabelText("Email").props.value).toBe("priya@example.com"));
  });
});

describe("A6 · create an account", () => {
  it("says what is missing before calling the server", async () => {
    renderRouter("./app", { initialUrl: "/register" });
    await waitFor(() => expect(screen.getByText("Create an account")).toBeTruthy());
    press("Create account");
    expect(screen.getByText("Tell us your name.")).toBeTruthy();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Choose a password of at least eight characters.")).toBeTruthy();
    expect(mockAuth.register).not.toHaveBeenCalled();
  });

  it("offers to sign in instead when the email already has an account", async () => {
    mockAuth.register.mockRejectedValue(new ApiError("http", 409, "Email already in use: priya@example.com"));
    renderRouter("./app", { initialUrl: "/register" });
    await waitFor(() => expect(screen.getByText("Create an account")).toBeTruthy());
    type("Name", "Priya");
    type("Email", "priya@example.com");
    type("Password", "secret123");
    press("Create account");
    await waitFor(() => expect(screen.getByText("That email already has an account.")).toBeTruthy());
    press("Sign in instead");
    await waitFor(() => expect(screen).toHavePathname("/email-sign-in"));
    expect(screen.getByLabelText("Email").props.value).toBe("priya@example.com");
  });

  it("creates the account, with the mobile in +91 form, and asks About you next", async () => {
    mockAuth.register.mockResolvedValue(tokensFor());
    willSignInAs(person({ welcomePending: true }));
    renderRouter("./app", { initialUrl: "/register" });
    await waitFor(() => expect(screen.getByText("Create an account")).toBeTruthy());
    type("Name", " Priya ");
    type("Email", "priya@example.com");
    type("Password", "secret123");
    type(/Mobile number \(optional\)/, "9876543210");
    press("Create account");
    await waitFor(() => expect(screen).toHavePathname("/about-you"));
    expect(mockAuth.register).toHaveBeenCalledWith({
      name: "Priya",
      email: "priya@example.com",
      password: "secret123",
      phone: "+919876543210",
    });
  });
});

describe("A7 · forgot password", () => {
  it("resets by email and returns to sign-in with the address filled in", async () => {
    renderRouter("./app", { initialUrl: "/forgot-password?email=priya%40example.com" });
    await waitFor(() => expect(screen.getByText("Forgot password")).toBeTruthy());
    press("Send the code");
    await waitFor(() => expect(screen.getByText("If an account uses this, we've sent it a code.")).toBeTruthy());
    expect(mockAuth.forgotPassword).toHaveBeenCalledWith("priya@example.com");
    fireEvent.changeText(screen.getByTestId("reset-code-input"), "123456");
    type("New password", "newpass123");
    press("Save new password");
    await waitFor(() => expect(screen).toHavePathname("/email-sign-in"));
    expect(mockAuth.resetPassword).toHaveBeenCalledWith({ email: "priya@example.com", code: "123456", newPassword: "newpass123" });
    expect(screen.getByText("Password changed. Sign in with the new one.")).toBeTruthy();
    expect(screen.getByLabelText("Email").props.value).toBe("priya@example.com");
  });

  it("resets by mobile and offers the texted-code sign-in", async () => {
    renderRouter("./app", { initialUrl: "/forgot-password" });
    await waitFor(() => expect(screen.getByText("Forgot password")).toBeTruthy());
    press("Mobile");
    type(/Mobile number/, "9876543210");
    press("Send the code");
    await waitFor(() => expect(mockAuth.forgotPasswordByPhone).toHaveBeenCalledWith("+919876543210"));
    fireEvent.changeText(screen.getByTestId("reset-code-input"), "123456");
    type("New password", "newpass123");
    press("Save new password");
    await waitFor(() => expect(screen).toHavePathname("/phone"));
    expect(mockAuth.resetPasswordByPhone).toHaveBeenCalledWith({ phone: "+919876543210", code: "123456", newPassword: "newpass123" });
  });

  it("keeps the new password to the backend's rule", async () => {
    renderRouter("./app", { initialUrl: "/forgot-password?email=priya%40example.com" });
    await waitFor(() => expect(screen.getByText("Forgot password")).toBeTruthy());
    press("Send the code");
    await waitFor(() => expect(screen.getByTestId("reset-code-input")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("reset-code-input"), "123456");
    type("New password", "onlyletters");
    press("Save new password");
    expect(screen.getByText("Put at least one letter and one number in the password.")).toBeTruthy();
    expect(mockAuth.resetPassword).not.toHaveBeenCalled();
  });

  it("shows a wrong code at the boxes", async () => {
    mockAuth.resetPassword.mockRejectedValue(new ApiError("http", 400, "That code is wrong or has expired."));
    renderRouter("./app", { initialUrl: "/forgot-password?email=priya%40example.com" });
    await waitFor(() => expect(screen.getByText("Forgot password")).toBeTruthy());
    press("Send the code");
    await waitFor(() => expect(screen.getByTestId("reset-code-input")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("reset-code-input"), "999999");
    type("New password", "newpass123");
    press("Save new password");
    await waitFor(() => expect(screen.getByText("That code is wrong or has expired.")).toBeTruthy());
  });
});

describe("A8 · a shop's emailed code", () => {
  it("saves the trusted-device token and takes the shop to the web-only screen", async () => {
    mockAuth.shopEmailCode.mockResolvedValue({ ...tokensFor(), deviceToken: "device-1" });
    willSignInAs(person({ role: "RETAILER", switchTo: "CUSTOMER" }));
    renderRouter("./app", { initialUrl: "/email-code?challenge=ch-1&hint=s***%40example.com" });
    await waitFor(() => expect(screen.getByText("Check your email")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("shop-code-input"), "654321");
    await waitFor(() => expect(screen).toHavePathname("/web-only"));
    expect(mockAuth.shopEmailCode).toHaveBeenCalledWith({ challengeToken: "ch-1", code: "654321" });
    expect(mockSecure["hv.device"]).toBe("device-1");
  });

  it("says to start again when opened without a pending sign-in", async () => {
    renderRouter("./app", { initialUrl: "/email-code" });
    await waitFor(() => expect(screen.getByText(/This sign-in has expired/)).toBeTruthy());
  });
});

describe("A9 · Google callback (cold start)", () => {
  it("exchanges the code and goes home", async () => {
    mockAuth.exchangeGoogleCode.mockResolvedValue(tokensFor());
    willSignInAs(person({ role: "PAINTER" }));
    renderRouter("./app", { initialUrl: "/sign-in/callback?code=cold-1" });
    await waitFor(() => expect(screen).toHavePathname("/painter"));
    expect(mockAuth.exchangeGoogleCode).toHaveBeenCalledWith("cold-1", undefined);
  });

  it("says Google did not finish when Google sent an error", async () => {
    renderRouter("./app", { initialUrl: "/sign-in/callback?error=access_denied" });
    await waitFor(() => expect(screen.getByText("Google sign-in didn't finish. Try again.")).toBeTruthy());
    press("Back to sign in");
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(mockAuth.exchangeGoogleCode).not.toHaveBeenCalled();
  });
});

describe("A10 · About you", () => {
  it("saves the name and takes a homeowner on to the tour", async () => {
    signedInAs(person({ name: "User 3210", namePending: true, welcomePending: true }));
    mockAuth.updateProfile.mockResolvedValue(person({ name: "Priya", welcomePending: true }));
    renderRouter("./app", { initialUrl: "/about-you" });
    await waitFor(() => expect(screen.getByText("About you")).toBeTruthy());
    expect(screen.getByLabelText("What should we call you?").props.value).toBe("");
    press("Continue");
    expect(screen.getByText("Tell us what to call you.")).toBeTruthy();
    expect(screen.getByText("Choose how you'll use HueVistaa.")).toBeTruthy();
    type("What should we call you?", "Priya");
    fireEvent.press(screen.getByTestId("use-home"));
    press("Continue");
    await waitFor(() => expect(screen).toHavePathname("/tour"));
    expect(mockAuth.updateProfile).toHaveBeenCalledWith({ name: "Priya" });
  });

  it("makes a painter a painter, ends the first run and opens the painter's home", async () => {
    signedInAs(person({ name: "Ravi", welcomePending: true }));
    mockBecomePainter.mockResolvedValue({ userId: "u1" });
    mockAuth.welcomeSeen.mockResolvedValue(person({ name: "Ravi", role: "PAINTER" }));
    renderRouter("./app", { initialUrl: "/about-you" });
    await waitFor(() => expect(screen.getByText("About you")).toBeTruthy());
    fireEvent.press(screen.getByTestId("use-painter"));
    expect(screen.getByText(/A painter account is for work/)).toBeTruthy();
    press("Continue");
    await waitFor(() => expect(screen).toHavePathname("/painter"));
    expect(mockAuth.updateProfile).not.toHaveBeenCalled();
    expect(mockAuth.welcomeSeen).toHaveBeenCalled();
  });

  it("keeps a customer a customer when the backend refuses, and says why", async () => {
    signedInAs(person({ name: "Ravi", welcomePending: true }));
    mockBecomePainter.mockRejectedValue(new ApiError("http", 403, "This account already has rooms, so it stays a customer account."));
    renderRouter("./app", { initialUrl: "/about-you" });
    await waitFor(() => expect(screen.getByText("About you")).toBeTruthy());
    fireEvent.press(screen.getByTestId("use-painter"));
    press("Continue");
    await waitFor(() => expect(screen.getByText(/already has rooms/)).toBeTruthy());
    expect(screen).toHavePathname("/about-you");
    expect(mockAuth.welcomeSeen).not.toHaveBeenCalled();
  });
});

describe("A11 · tour", () => {
  it("steps through three cards and starts at home, marking the first run done", async () => {
    signedInAs(person({ welcomePending: true }));
    mockAuth.welcomeSeen.mockResolvedValue(person());
    renderRouter("./app", { initialUrl: "/tour" });
    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeTruthy());
    press("Next");
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    press("Next");
    expect(screen.getByText("Step 3 of 3")).toBeTruthy();
    expect(screen.queryByText("Skip")).toBeNull();
    press("Start");
    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAuth.welcomeSeen).toHaveBeenCalled();
  });

  it("can be skipped, which also counts as shown", async () => {
    signedInAs(person({ welcomePending: true }));
    mockAuth.welcomeSeen.mockResolvedValue(person());
    renderRouter("./app", { initialUrl: "/tour" });
    await waitFor(() => expect(screen.getByText("Skip")).toBeTruthy());
    press("Skip");
    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAuth.welcomeSeen).toHaveBeenCalled();
  });

  it("goes to the shop-code screen from the last card", async () => {
    signedInAs(person({ welcomePending: true }));
    mockAuth.welcomeSeen.mockResolvedValue(person());
    renderRouter("./app", { initialUrl: "/tour" });
    await waitFor(() => expect(screen.getByText("Next")).toBeTruthy());
    press("Next");
    press("Next");
    press("I have a code from my shop");
    await waitFor(() => expect(screen).toHavePathname("/add-shop-code"));
  });
});

describe("S10 · web-only accounts", () => {
  it("lets a shop step into its customer profile", async () => {
    signedInAs(person({ name: "Sharma Paints", role: "RETAILER", switchTo: "CUSTOMER" }));
    mockAuth.switchProfile.mockResolvedValue(tokensFor("refresh-customer"));
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/web-only"));
    expect(screen.getByText("Shop tools live on the website")).toBeTruthy();
    mockAuth.profile.mockResolvedValue(person({ name: "Sharma Paints", linkedProfile: true, switchTo: "SHOP" }));
    press("Continue as customer");
    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAuth.switchProfile).toHaveBeenCalledWith({ deviceToken: undefined, refreshToken: "refresh-0" });
    expect(mockSecure["hv.refresh"]).toBe("refresh-customer");
  });

  it("hides the customer switch when there is no profile to switch to", async () => {
    signedInAs(person({ role: "DISTRIBUTOR" }));
    renderRouter("./app", { initialUrl: "/web-only" });
    await waitFor(() => expect(screen.getByText("Shop tools live on the website")).toBeTruthy());
    expect(screen.queryByText("Continue as customer")).toBeNull();
  });

  it("signs out to Welcome, and the next sign-in is not sent back here", async () => {
    signedInAs(person({ role: "RETAILER" }));
    renderRouter("./app", { initialUrl: "/web-only" });
    await waitFor(() => expect(screen.getByText("Sign out")).toBeTruthy());
    press("Sign out");
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    expect(mockAuth.logout).toHaveBeenCalled();
    expect(mockSecure["hv.refresh"]).toBeUndefined();

    // Someone else signs in on the same phone.
    mockAuth.login.mockResolvedValue(tokensFor());
    willSignInAs(person({ name: "Anil" }));
    press("Use email instead");
    await waitFor(() => expect(screen.getByText("Sign in with email")).toBeTruthy());
    type("Email", "anil@example.com");
    type("Password", "secret123");
    press("Sign in");
    await waitFor(() => expect(screen).toHavePathname("/home"));
  });
});

describe("A1 · back to the page opened before sign-in", () => {
  it("opens the studio link after sign-in instead of home", async () => {
    renderRouter("./app", { initialUrl: "/room/abc123/paint" });
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    mockAuth.login.mockResolvedValue(tokensFor());
    willSignInAs(person());
    press("Use email instead");
    await waitFor(() => expect(screen.getByText("Sign in with email")).toBeTruthy());
    type("Email", "priya@example.com");
    type("Password", "secret123");
    press("Sign in");
    await waitFor(() => expect(screen).toHavePathname("/room/abc123/paint"));
  });

  it("keeps the link through a brand-new account's first run", async () => {
    renderRouter("./app", { initialUrl: "/room/abc123/paint" });
    await waitFor(() => expect(screen).toHavePathname("/welcome"));
    mockAuth.login.mockResolvedValue(tokensFor());
    willSignInAs(person({ welcomePending: true }));
    mockAuth.welcomeSeen.mockResolvedValue(person());
    press("Use email instead");
    await waitFor(() => expect(screen.getByText("Sign in with email")).toBeTruthy());
    type("Email", "priya@example.com");
    type("Password", "secret123");
    press("Sign in");
    await waitFor(() => expect(screen).toHavePathname("/about-you"));
    fireEvent.press(screen.getByTestId("use-home"));
    press("Continue");
    await waitFor(() => expect(screen).toHavePathname("/tour"));
    press("Skip");
    await waitFor(() => expect(screen).toHavePathname("/room/abc123/paint"));
  });
});
