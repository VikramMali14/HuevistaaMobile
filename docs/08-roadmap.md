# 08 · Roadmap and checklist

We build in phases. Each phase ends with something a real person can use. Within a
phase, build screens in the order listed. Tick a screen only when it meets
**Definition of done** below.

The painter half (Phase 6) depends only on Phase 1, so it can run in parallel with
Phases 2–5 if there are two people.

## Definition of done (every screen)

- [ ] Matches its spec, **including every state listed**: loading, empty, error,
      offline, and the special cases.
- [ ] Every string in `src/i18n`; money through `formatRupees()`.
- [ ] Accessibility labels and roles; targets ≥ 48 dp; works at 1.3× font size.
- [ ] Checked in dark **and** light.
- [ ] Logic in `src/features` / `src/lib` with unit tests; `npm run check`
      (typecheck, lint with zero warnings, all tests — including the route test that
      opens every screen) passes.
- [ ] Tried on a real mid-range Android (mandatory for studio screens).
- [ ] Placeholder removed and the screen's `status` in `src/navigation/screens.ts`
      set to `"built"`.

---

## Phase 0 — Foundation ✅

The project, the theme, the UI kit basics, the API client with safe token refresh, the
session, role-based routing, and a placeholder for every screen below.

## Phase 1 — Signing in and the first run

| | Screen | Spec |
|---|---|---|
| ☑ | A1 Splash and session restore | [03](03-screens-auth.md#a1--splash-and-session-restore) |
| ☑ | A2 Welcome | [03](03-screens-auth.md#a2--welcome) |
| ☑ | A3 Your mobile number | [03](03-screens-auth.md#a3--your-mobile-number) |
| ☑ | A4 Enter the code | [03](03-screens-auth.md#a4--enter-the-code) |
| ☑ | A5 Sign in with email | [03](03-screens-auth.md#a5--sign-in-with-email) |
| ☑ | A6 Create an account | [03](03-screens-auth.md#a6--create-an-account-with-email) |
| ☑ | A7 Forgot password | [03](03-screens-auth.md#a7--forgot-password) |
| ☑ | A8 Check your email (shops) | [03](03-screens-auth.md#a8--check-your-email-shops-only) |
| ☑ | A9 Google sign-in | [03](03-screens-auth.md#a9--google-sign-in) |
| ☑ | A10 About you | [03](03-screens-auth.md#a10--about-you-first-run) |
| ☑ | A11 Quick tour | [03](03-screens-auth.md#a11--quick-tour-customers) |
| ☑ | S10 Web-only accounts | [06](06-screens-shared.md#s10--web-only-accounts) |

UI kit added: `PhoneField`, `CodeInput`, `Toast`, `ChoiceCard`, `Segmented`, `Banner`,
`BackButton`, `BrandMark`; `TextField` gained `revealable`. (`Sheet` moved to Phase 2,
where the first sheet appears.)

**Done:** 2026-10. Every screen's states are covered by route tests
(`src/__tests__/sign-in-flows.test.tsx`, `shop-code-resend.test.tsx`) and were walked
through in a phone-sized browser against a stand-in backend, light and dark.

## Phase 2 — Home, catalogue, account

| | Screen | Spec |
|---|---|---|
| ☑ | C1 Home | [04](04-screens-customer.md#c1--home) |
| ☑ | C3 Catalogue | [04](04-screens-customer.md#c3--catalogue) |
| ☑ | C19 Shade detail | [04](04-screens-customer.md#c19--shade-detail) |
| ☑ | C20 Ready-made rooms | [04](04-screens-customer.md#c20--ready-made-rooms) |
| ☑ | C21 Ready-made room | [04](04-screens-customer.md#c21--ready-made-room) |
| ☑ | C30 Add a shop code | [04](04-screens-customer.md#c30--add-a-shop-code) |
| ☑ | C31 My products | [04](04-screens-customer.md#c31--my-products) |
| ☑ | C5 Account | [04](04-screens-customer.md#c5--account) |
| ☑ | S1 Settings | [06](06-screens-shared.md#s1--settings) |
| ☑ | S2 Your name | [06](06-screens-shared.md#s2--your-name) |
| ☑ | S3 Email | [06](06-screens-shared.md#s3--email) |
| ☑ | S4 Mobile number | [06](06-screens-shared.md#s4--mobile-number) |
| ☑ | S5 Password | [06](06-screens-shared.md#s5--password) |
| ☑ | S9 Delete account | [06](06-screens-shared.md#s9--delete-account) |

Packages: `@shopify/flash-list` (2.0.2). UI kit added: `SwatchTile`, `ShadeCode`, `Chip`,
`ListRow`/`ListGroup`, `BalanceChip`, `Skeleton`, `Sheet`, `ConfirmSheet`, `Avatar`,
`RemoteImage`, `SectionHeader`, `FormScreen`; `CodeInput` takes letters for shop codes.
Ported unchanged from the website (with their tests): `color`, `color-science`,
`colour-search`, `colour-families`, `shade-codes`, `shade-codec`; `shade-mapping` with the
company slug added. (`money.ts` came in Phase 0.)

**Done:** 2026-10. Route tests for every screen's states
(`src/__tests__/phase2-screens.test.tsx`) and unit tests for the balance, catalogue
filter, room status, dates and image helper; walked through in a phone-sized browser
against a stand-in backend, light and dark. Found on the way: Home's rooms were not
refreshed after a shop code; the first-visit card's secondary button vanished on the
photo; a search left the catalogue scrolled past its filters.

**Audit:** 2026-10, every Phase 2 screen, hook and helper read against the backend and
the website. Fixed, each with a test that failed before it:
- Shade names and the company were printed while the scheme was loading or had failed
  (now only on an explicit `true`, as the website's studio reads it).
- A sign-in that switched profile kept the last profile's rooms, catalogue copy and
  pictures; one whose new profile could not be read stayed on the old profile.
- C19 showed shades outside the account's catalogue from the public list; offered
  rooms still being read or without walls; missed links with a capitalised company.
- C21 made a duplicate copy on every visit (the backend never reuses one): an
  unfinished copy now opens first. The room was also fetched twice while the list
  loaded.
- C31 hid a shop that had picked nothing out (that means its full range) and never
  showed the companies a shop unlocked.
- C30's done screen waited for the whole catalogue to download again.
- Home and Account greeted and showed the stand-in name of an account with none.
- S1/S9 offered Delete account on a shop's customer profile (the website does not).
- S3's refused resend appeared under the code boxes as if the code were wrong; S5's
  empty current password repeated the field label; S2's unchanged Save could go back
  to nothing.
- Pull to refresh spun on every background reload; pictures were downloaded again
  each time the token refreshed; a picture that failed once stayed failed for a new
  address.
- Layout: C21's tall photo pushed the room's name under the buttons; Account's
  balance squeezed its title onto two lines; C19's status bar now reads on the colour.

## Phase 3 — The studio

**The colour engine came first** ([07](07-architecture.md#the-colour-engine-the-biggest-risk)):
the website's shaders run on `expo-gl` unchanged and render correctly under real WebGL 2
(a phone-sized Chromium, light and dark). **Still to do on a real mid-range Android:**
open Settings, press and hold the version, and run the live-colour check — it paints a
sample room 60 times and passes when 95% of changes show in under 100 ms. If it fails,
the fallback in 07 applies.

| | Screen | Spec |
|---|---|---|
| ☑ | Spike: walls recoloured on `expo-gl` (kept as the live-colour check) | [07](07-architecture.md#the-colour-engine-the-biggest-risk) |
| ☑ | C2 Studio — my rooms | [04](04-screens-customer.md#c2--studio--my-rooms) |
| ☑ | C6 Add photo | [04](04-screens-customer.md#c6--add-photo-step-1) |
| ☑ | C7 Name it | [04](04-screens-customer.md#c7--name-it-still-step-1) |
| ☑ | CR Open a room at its step | [04](04-screens-customer.md#the-studio--one-room-five-steps) |
| ☑ | C8 Tidy up | [04](04-screens-customer.md#c8--tidy-up-steps-2-and-3-working) |
| ☑ | C9 Walls found | [04](04-screens-customer.md#c9--walls-found-step-3) |
| ☑ | C11 Paint | [04](04-screens-customer.md#c11--paint-step-5--the-most-important-screen) |
| ☑ | C12 Shade picker | [04](04-screens-customer.md#c12--shade-picker) |
| ☑ | C13 Suggested palettes | [04](04-screens-customer.md#c13--suggested-palettes) |
| ☑ | C14 Before and after | [04](04-screens-customer.md#c14--before-and-after) |
| ☑ | C10 Adjust walls | [04](04-screens-customer.md#c10--adjust-walls-step-4) |
| ☑ | C18 The walls are wrong | [04](04-screens-customer.md#c18--the-walls-are-wrong) |

Packages: `expo-gl`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`,
`expo-file-system`, `expo-sharing`, `fflate` (the mask PNG's deflate); `pngjs` for tests.
UI kit added: `StepDots`, `WorkingState`, `IconButton`, `ZoomView` (pinch and two-finger
pan on the UI thread). `ListRow` and `Card` take a press and hold.

**Done:** 2026-10. Route tests for every screen (`src/__tests__/phase3-studio.test.tsx`),
unit tests for the paint store, mask geometry and PNG encoder, step routing, polling,
the paint plan and the engine's arithmetic; walked through end to end in a phone-sized
browser against a stand-in backend with real wall masks — a new photo from the gallery,
upload, Tidy up, the walls, painting, a shade, a palette, before and after, a brush
stroke saved as a mask, a report — light and dark. Found on the way: a room never
reported (204) handed React Query `undefined`; the paint dock's buttons wrapped; web
switches had the browser's thumb colour.

Not yet: the magnifier above the finger in C10, and edge snapping there; the outline
on the selected wall in C11 (the wall strip shows which is selected); C25 for finished
rooms (they open on Paint, view only, until Phase 4); the board tray's screen (C15,
Phase 4 — combinations are already kept).

**Audit:** 2026-10, every Phase 3 screen, store and engine module read against the
backend and the website, then walked again in the browser. Fixed, each with a test that
failed before it (or, for the GPU, checked on screen):
- C10 lost edits: a wall switched away from kept its edits only as a picture on the
  GPU, so anything that started the canvas over (a banner, a turn of the phone) dropped
  them and Done saved the old masks. Edits are now lists per wall, redrawn from the list,
  and each wall keeps its own Undo. The swipe and Android's back skipped "Leave without
  saving?". An emptied wall could be saved (erasing it); corners laid out were ignored
  by Done; a part-saved Done marked the saved walls changed again.
- Saved colours painted at their hex, not their shade's lightness, once a room was
  opened again; the backend's opening colours showed as hexes with no code — both now as
  the website reads them (the shade found again; opening colours snapped to the nearest
  shade of one company).
- A room that closed or was deleted while being painted had its colours sent every
  10 seconds for ever ("we'll keep trying"); now it stops, says why, and shows what is
  really saved. Deleting a room left its unsaved colours queued and its tray kept. What
  is waiting is sent when the app goes to the background.
- The selected wall could be one taken out of the plan on C9, so Browse painted a wall
  not on screen.
- C8 read every 402 as "automatic wall finding isn't available" (the backend never says
  that; a 402 is the room itself), and promised "about a minute" for ever — it now says
  so after the website's 8 minutes and offers a report.
- C9's "Tap a wall to find it" showed nothing on the photo (the wall picked now stands
  out); a refused switch put back every other switch flipped meanwhile.
- Back from a new room's Tidy up went to the camera.
- A picture half-written to the phone's cache (app closed mid-download) was never fetched
  again, so the room never loaded; the studio's pictures stayed on the phone after
  sign-out. A photo or wall that failed to load had no Try again.
- Banners that come and go (a failed save, a load problem) resized the canvas and started
  the GPU over; so did the first colour picked and switching to Shape.
- Zoom went round the middle rather than the fingers, and the photo could be pushed off
  the screen. C6 offered a sample room with none to show, lost a gallery error, and let
  the shutter be pressed before the camera was ready; Android's back from the preview
  left the screen. "Save this combination" with nothing painted said it was already saved;
  a view-only room with no walls offered to mark them; "1 corners".

## Phase 4 — Boards and payments

| | Screen | Spec |
|---|---|---|
| ☐ | C15 Colour board — choose and confirm | [04](04-screens-customer.md#c15--colour-board--choose-and-confirm) |
| ☐ | C16 Board ready | [04](04-screens-customer.md#c16--board-ready) |
| ☐ | C4 Boards | [04](04-screens-customer.md#c4--boards) |
| ☐ | C25 Board detail | [04](04-screens-customer.md#c25--board-detail) |
| ☐ | C17 Share this room | [04](04-screens-customer.md#c17--share-this-room) |
| ☐ | C27 Rooms and credits | [04](04-screens-customer.md#c27--rooms-and-credits) |
| ☐ | C28 Checkout | [04](04-screens-customer.md#c28--checkout) |
| ☐ | C29 Payment result | [04](04-screens-customer.md#c29--payment-result) |
| ☐ | D3 Payment return | [06](06-screens-shared.md#d3--payment-return) |

Packages: `npx expo install expo-sharing expo-media-library`.

## Phase 5 — AI images

| | Screen | Spec |
|---|---|---|
| ☐ | C22 AI image — choose the room | [04](04-screens-customer.md#c22--ai-image--choose-the-room) |
| ☐ | C23 AI image — options | [04](04-screens-customer.md#c23--ai-image--options) |
| ☐ | C24 AI image — working and result | [04](04-screens-customer.md#c24--ai-image--working-and-result) |

## Phase 6 — The painter

| | Screen | Spec |
|---|---|---|
| ☐ | P1 Home | [05](05-screens-painter.md#p1--home) |
| ☐ | P3 Scan | [05](05-screens-painter.md#p3--scan) |
| ☐ | P6 Claim a board | [05](05-screens-painter.md#p6--claim-a-board) |
| ☐ | P8 Type the code | [05](05-screens-painter.md#p8--type-the-code) |
| ☐ | P2 Points | [05](05-screens-painter.md#p2--points) |
| ☐ | P4 Rewards | [05](05-screens-painter.md#p4--rewards) |
| ☐ | P9 Reward detail | [05](05-screens-painter.md#p9--reward-detail) |
| ☐ | P10 My vouchers | [05](05-screens-painter.md#p10--my-vouchers) |
| ☐ | P11 Voucher | [05](05-screens-painter.md#p11--voucher) |
| ☐ | P5 Nearby — be found | [05](05-screens-painter.md#p5--nearby--be-found-by-customers) |
| ☐ | P12 Trade profile | [05](05-screens-painter.md#p12--trade-profile) |
| ☐ | P7 Board came as a PDF | [05](05-screens-painter.md#p7--board-came-as-a-pdf) |
| ☐ | C33 Work as a painter | [04](04-screens-customer.md#c33--work-as-a-painter) |

Packages: `npx expo install expo-camera expo-location expo-document-picker react-native-webview`.
Port: `HueVistaaPainter/src/lib/reward-token.ts`, `board-file.ts` (in a WebView).

## Phase 7 — Nearby, community, help and links

| | Screen | Spec |
|---|---|---|
| ☐ | C32 Painters and shops near you | [04](04-screens-customer.md#c32--painters-and-shops-near-you) |
| ☐ | C26 Review the job | [04](04-screens-customer.md#c26--review-the-job) |
| ☐ | S6 Help and support | [06](06-screens-shared.md#s6--help-and-support) |
| ☐ | S7 Support conversation | [06](06-screens-shared.md#s7--support-conversation) |
| ☐ | S8 Questions and answers | [06](06-screens-shared.md#s8--questions-and-answers) |
| ☐ | D1 A board's QR | [06](06-screens-shared.md#d1--a-boards-qr) |
| ☐ | D2 A shared room | [06](06-screens-shared.md#d2--a-shared-room) |
| ☐ | App Links for `huevistaa.com/r/*` and `/share/*` | cross-repo task 1 |

## Phase 8 — Polish and release

- [ ] Push notifications (needs the backend work below): walls ready, AI image ready,
      points credited, voucher delivered, support reply.
- [ ] Hindi (`src/i18n/hi.ts`) and a language choice in S1.
- [ ] Crash reporting and analytics (Sentry recommended) — and the privacy policy
      updated to say so.
- [ ] Maestro end-to-end flows in CI.
- [ ] X5 minimum-version check.
- [ ] Play Store listing: screenshots, description, data-safety form, content rating.
- [ ] iOS build and App Store review.

---

## Changes needed outside this repo

| # | Repo | Change | Needed by |
|---|---|---|---|
| 1 | HueVistaFrontEnd | Serve `/.well-known/assetlinks.json` with the app's signing-certificate SHA-256, so `huevistaa.com/r/*` and `/share/*` open the app (App Links). Later `apple-app-site-association` for iOS. | Phase 7 |
| 2 | HueVistaFrontEnd | Confirm `/pay/mobile` is deployed and `NEXT_PUBLIC_MOBILE_PAY_REDIRECT` is unset (defaults to `huevista://pay/callback`). | Phase 4 |
| 3 | HueVistaFrontEnd | Set `NEXT_PUBLIC_APK_URL` to the preview APK once one exists. | Phase 1+ |
| 4 | HueVista | Confirm `MOBILE_OAUTH_REDIRECT_URI` is `huevista://sign-in/callback` in production. | Phase 1 |
| 5 | HueVista | Push notifications: an endpoint to register a phone's push token (the existing `deviceToken` is the shop trusted-device token — a different thing), and sends on the events in Phase 8. | Phase 8 |
| 6 | HueVista | A tiny public endpoint returning the minimum supported app version (X5). | Phase 8 |
| 7 | HueVista | Optional: nearby search by area name, for people who won't share location (C32). | Phase 7 |
| 8 | HueVista | `docs/HueVista_Mobile_API_Guide.pdf` only covers sign-in and images — update it or point it at Swagger. | Any time |

## Decisions to confirm

| Decision | Current choice | Note |
|---|---|---|
| Store name | HueVistaa | |
| Android package / iOS bundle id | `com.gridstore.huevistaa` | **Cannot be changed after the first Play Store upload** — confirm before Phase 8 |
| Link scheme | `huevista` | Must match the backend and website defaults |
| Platforms | Android first, iOS after | |
| Languages | English, then Hindi | |
| Crash/analytics vendor | Sentry (suggested) | |
