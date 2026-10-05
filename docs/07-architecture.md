# 07 · Architecture

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Expo SDK 57**, React Native 0.86, React 19, **TypeScript (strict)** | The team already writes React + TypeScript; Expo gives camera, GL, secure storage and store builds without native code |
| Navigation | **expo-router** (files in `app/` are screens) | Deep links (`huevista://`, `https://huevistaa.com/r/…`) map to files for free |
| Server data | **@tanstack/react-query** | Caching, retries and refetch-on-focus for patchy 4G |
| Tokens | **expo-secure-store** | Android Keystore / iOS Keychain |
| Non-secret cache | **@react-native-async-storage/async-storage** | Cached profile, board tray, recent shades |
| Network state | **@react-native-community/netinfo** | The offline banner (X1) |
| Fonts | **Inter** + **Instrument Serif italic** (`@expo-google-fonts/*`) | The website's faces |
| Icons | **@expo/vector-icons** (Feather) | Thin line icons that suit ink and paper |
| Gestures and animation | **react-native-gesture-handler**, **react-native-reanimated** | Pinch/pan on the canvas, sheets. Already installed: expo-router pulls them in, so they are pinned to the SDK's versions |
| Tests | **jest-expo** + **@testing-library/react-native** | Logic and components |
| Lint | **eslint-config-expo** (flat config) | Expo's rules |
| Builds | **EAS Build / Submit / Update** | APK for testing, AAB for Play, over-the-air JS fixes |

Added later, by the screen that needs them (see [08-roadmap.md](08-roadmap.md)):
`expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-gl`,
`expo-file-system`, `expo-sharing`, `expo-media-library`, `expo-document-picker`,
`expo-location`, `@shopify/flash-list`, `react-native-webview`. Always add them with
`npx expo install <name>` so the version matches the SDK. (If the network blocks Expo's
version service, prefix it with `EXPO_OFFLINE=1` — it then uses the versions listed
inside the installed `expo` package.)

## Folder structure

```
HuevistaaMobile/
├── app/                              # every file is a screen (expo-router)
│   ├── _layout.tsx                   # A1 providers, fonts, splash
│   ├── index.tsx                     # A1 "where should this person go?"
│   ├── +not-found.tsx                # X6
│   ├── dev.tsx                       # development only: list of every screen
│   ├── (auth)/                       # signed-out only            A2–A8
│   ├── sign-in/callback.tsx          # A9 Google return
│   ├── (onboarding)/                 # first run                  A10–A11
│   ├── (customer)/                   # CUSTOMER only
│   │   ├── (tabs)/                   # Home · Studio · Catalogue · Boards · Account
│   │   ├── room/                     # the studio pipeline        C6–C18
│   │   ├── shade/[brand]/[code].tsx  # C19
│   │   ├── library/                  # C20–C21
│   │   ├── ai-image/                 # C22–C24
│   │   └── …                         # C25–C33
│   ├── painter/                      # PAINTER only
│   │   ├── (tabs)/                   # Home · Points · Scan · Rewards · Nearby
│   │   └── …                         # P6–P12
│   ├── (account)/                    # any signed-in role         S1–S10
│   ├── r/[token].tsx                 # D1 board QR
│   ├── share/[token].tsx             # D2 shared room
│   └── pay/callback.tsx              # D3 payment return
│
├── src/
│   ├── api/
│   │   ├── client.ts                 # createApiClient: base URL, JSON, Bearer, refresh, timeouts
│   │   ├── instance.ts               # the app's one client + its tokens
│   │   ├── errors.ts                 # ApiError + plain-English messages
│   │   ├── types.ts                  # response shapes (mirror the backend DTOs)
│   │   ├── query-client.ts           # react-query defaults, online/focus wiring
│   │   └── endpoints/                # one file per backend module
│   │       ├── auth.ts               #   /api/auth/**
│   │       └── …                     #   projects, shades, billing, painter … added per screen
│   ├── auth/
│   │   ├── session.tsx               # SessionProvider + useSession()
│   │   ├── token-manager.ts          # tokens in memory + the single shared refresh
│   │   ├── token-store.ts            # secure storage for tokens
│   │   ├── routing.ts                # homeFor(profile) — the role router
│   │   └── guards.tsx                # useGuard() for route-group layouts
│   ├── components/
│   │   ├── ui/                       # the design-system components
│   │   └── PlannedScreen.tsx         # stand-in for screens not built yet
│   ├── features/                     # screen-specific logic (created as screens need it)
│   │   ├── studio/                   #   recolor engine, canvas, board tray (Phase 3)
│   │   ├── catalogue/                #   swatch grid, filters (Phase 2)
│   │   └── painter/                  #   scanner, claim (Phase 6)
│   ├── config/env.ts                 # API origin, site origin, app scheme
│   ├── i18n/                         # every user-facing string
│   ├── lib/                          # pure helpers (money, validation, ported web logic)
│   ├── navigation/screens.ts         # the registry of every planned screen
│   └── theme/                        # tokens from docs/02-design-system.md
│
├── assets/                           # icon, splash, images
├── app.json                          # name, scheme "huevista", ids, plugins
├── eas.json                          # build profiles
└── docs/                             # this plan
```

**Rules:**
- `app/` files stay thin: read params, call hooks, lay out components. Logic lives in
  `src/features/…` or `src/lib/…` where it can be tested.
- Screens never call `fetch` directly — always through `src/api/endpoints/*`.
- Every user-facing string goes through `t()` from `src/i18n`.
- Import with the `@/` alias (`@/api/client`), never long `../../..` paths.

## Routing and guards

Route groups in brackets do not change the URL; they only share a layout. Each
group's `_layout.tsx` is the guard:

| Group | Lets in | Otherwise |
|---|---|---|
| `(auth)` | signed out | → `homeFor(profile)` |
| `(onboarding)` | signed in | → `/welcome` |
| `(customer)` | `CUSTOMER` | → `homeFor(profile)` |
| `painter` | `PAINTER` | → `homeFor(profile)` |
| `(account)` | any signed-in role | → `/welcome` |
| `r/`, `share/`, `sign-in/`, `pay/` | everyone | — |

`homeFor(profile)` in `src/auth/routing.ts` is the single place the role decision is
made:

```
namePending or welcomePending  → /about-you
CUSTOMER                        → /home
PAINTER                         → /painter
anything else                   → /web-only
```

## Data on screen

- Every read goes through React Query with a key from `src/api/query-keys.ts`. A change
  says what it made stale there — `shopCodeChanges` lists everything a redeemed code
  touches (`shopCodeBalance`, the part worth waiting for). The whole cache — with the
  catalogue copy and the picture cache — is cleared on sign-out **and** when a sign-in
  brings a different profile (S10, C5's switch back), so keys need not carry the account.
- `useBalance()` (`src/features/account`) is the one place the rooms balance and the next
  step are worked out (`balanceFrom`, unit-tested).
- `useCatalogue()` (`src/features/catalogue`) keeps the account's catalogue on the phone
  in the website's packed shade format and filters it locally (`filter.ts`).
  `useShadeScheme()` answers one frozen `{}` until the scheme arrives (or when it fails),
  and `namesShown()` / `brandShown()` read only an explicit `true` — so nothing a shop
  hides can flash up while it loads.
- Pictures from the backend go through `RemoteImage` / `mediaSource()`
  (`src/api/media.ts`): an outside (presigned) link as it is, the backend's own
  `/api/…` file routes with the Bearer token. They are cached by address alone (not by
  token, which changes every 15 minutes); the cache is cleared with the account's data.
  A failed picture shows an icon, and a new address is tried afresh.
- Pull to refresh goes through `usePullToRefresh()` (`src/lib`): the spinner turns for a
  pull only, never for a reload the queries start themselves.
- Lists that can run to thousands use `FlashList`; in Jest it renders through
  `FlatList` (`jest.setup.ts`), because FlashList draws nothing before it has measured a
  window.

## API client

`src/api/client.ts`:

- Base URL from `src/config/env.ts` (`EXPO_PUBLIC_API_ORIGIN`).
- Sends JSON, or multipart for uploads; parses JSON; `204` → `undefined`.
- Adds `Authorization: Bearer <accessToken>` for signed-in calls.
- **Refresh, once, for everyone.** The access token lives 15 minutes; the refresh
  token is **single-use** (the backend rotates it). If two requests get a 401 at the
  same moment and both refresh, the second refresh fails and the person is signed
  out. So the client keeps **one shared refresh promise**: every 401 waits on it, then
  retries once with the new token. If the refresh is refused, the session ends (X4).
- Timeouts with `AbortController` (20 s default, longer for uploads).
- Errors become an `ApiError` with `status`, `message`, `fieldErrors`, `code`, and
  `kind: "http" | "network" | "timeout"`. `errors.ts` turns known codes into sentences.

## Session

`src/auth/session.tsx` holds `{ status: "loading" | "unreachable" | "signedOut" | "signedIn", profile }`
and exposes `completeSignIn(authResponse)`, `refreshProfile()`, `updateProfile(profile)`,
`markWelcomeSeen()`, `signOut()`.

- Tokens: secure storage keys `hv.access`, `hv.refresh`, and `hv.device` (the shop
  "trusted device" token from A8 — kept across sign-outs, like the website).
- The profile is cached in AsyncStorage so the app opens offline (A1).
- `completeSignIn()` saves the tokens, then loads the profile; if that load fails the
  tokens are cleared again, so a screen that says "not signed in" never hides a saved
  session.
- `refreshProfile()` / `updateProfile()` only apply to the account that is still signed
  in — an answer that lands after a sign-out or a profile switch is dropped.
- `markWelcomeSeen()` ends the first run on this phone at once and retries
  `POST /api/auth/welcome/seen` at the next start if it did not get through
  (`hv.welcomeSeenPending`).
- `signOut()` tells the server (`POST /api/auth/logout`) but waits at most 3 s for it,
  then clears tokens, the query cache and the cached profile. `signedOut.byChoice`
  stops guards remembering a page for whoever signs in next (A1).
- Forms submit through `useSubmit()` (`src/lib/use-submit.ts`): one request at a time,
  even when a code's sixth digit and a tap land in the same frame.

## Google sign-in

1. `WebBrowser.openAuthSessionAsync("{API}/oauth2/authorization/google?client=mobile", "huevista://sign-in/callback")`.
2. The backend answers with `huevista://sign-in/callback#code=…` (one minute,
   single use).
3. `POST /api/auth/oauth2/exchange { code }` → tokens.

The backend setting `MOBILE_OAUTH_REDIRECT_URI` must stay `huevista://sign-in/callback`,
and `app.json`'s `scheme` must stay `huevista`.

## Payments

Razorpay Checkout is a web library, so the app runs it on the website's
`/pay/mobile` page in a browser session — the same trick as Google sign-in. Money is
never decided on the phone or on that page.

1. Create the order with the API (`POST /api/billing/cart/order`,
   `/ai-credits/order`, …) → `{ orderId, amountPaise, razorpayKeyId, … }`.
2. Save `{ orderId, kind }` to AsyncStorage (for D3's cold-start case).
3. Open `{SITE}/pay/mobile?order={orderId}&key={keyId}&amount={amountPaise}&desc=…&name=…&contact=…`
   with `openAuthSessionAsync(…, "huevista://pay/callback")`.
4. The page returns `huevista://pay/callback#status=success&order_id=…&payment_id=…&signature=…`
   (or `status=cancelled`, or `status=failed&code=…&description=…`).
5. Verify with the matching endpoint (`/cart/verify`, `/ai-credits/verify`, …), renaming
   the fragment's fields to the backend's: `order_id → orderId`, `payment_id → paymentId`,
   `signature → signature`. Only the verify response changes what the app shows (C29).
6. Report what happened with `POST /api/billing/attempts/{reference}/events`, as the
   website does (`lib/payments.ts`).

## The colour engine (the biggest risk)

The website's `lib/webgl-recolor.ts` (805 lines) is WebGL2 with GLSL ES 3.00 shaders.
`expo-gl` gives a WebGL2-style context on the phone, so the shaders should carry
over. What does not carry over: everything that uses `document.createElement("canvas")`
to load the photo and masks into textures. Those parts are rewritten to decode images
with `expo-image-manipulator` / `expo-gl`'s asset loading.

**Do this first in Phase 3, as a spike, before building C8–C18:** load one project's
cleaned photo + masks, recolour one wall on `expo-gl`, measure on a real mid-range
Android. If `expo-gl` cannot keep up, the fallback is `@shopify/react-native-skia`
runtime shaders (SkSL — the shader needs translating).

Port alongside: `lib/canvas-light.ts` (scene light), `lib/color-science.ts`,
`lib/mask-feather.ts`, `lib/mask-grow.ts`.

## The colour board PDF

`lib/pdf-core.ts` is a small hand-written PDF writer and `lib/pdf-export.ts` lays out
the board. Both are plain TypeScript apart from a few canvas helpers, so they port.
Page images come from GL snapshots (`GLView.takeSnapshotAsync`) as JPEG. The file is
written with `expo-file-system` and shared with `expo-sharing`.

## Reusing the website's code

Copy plain TypeScript files from `HueVistaFrontEnd/src/lib/` into `src/lib/` when a
screen needs them, with a header comment naming the source file. Already DOM-free and
safe to copy: `color-science.ts`, `colour-families.ts`, `money.ts`, `shade-codes.ts`,
`harmony.ts`, `palette.ts`, `validation.ts`, `project-validity.ts`, `mask-grow.ts`.
Need small changes: `shade-codec.ts`, `dates.ts`, `pdf-core.ts`, `pdf-export.ts`,
`mask-feather.ts`. From the painter site: `lib/reward-token.ts`.

If the copies start drifting, move them into a shared npm package later. Not before.

## Offline and slow networks

- React Query retries failed reads (2 tries, backing off) and refetches on focus and
  reconnect.
- The shade catalogue and the profile are persisted, so they work offline.
- Colour autosaves queue while offline and replay in order.
- Uploads shrink photos on the phone first.
- Skeletons, never blank screens; nothing blocks on a request it doesn't need.

## Security

- Tokens only in secure storage, never in AsyncStorage, logs or crash reports.
- Production talks HTTPS only (`usesCleartextTraffic` stays off outside development).
- Deep links are parsed, never trusted: tokens are validated by the regexes the
  website uses and then checked by the server.
- Payment results are trusted only after the server verifies them.
- Board PDFs are read on the phone; only the token is sent (P7).
- Location for nearby search is sent per search, never stored by the app; a painter's
  base is coarsened to about 1 km before it is sent.

## Performance budget

| Thing | Target on a mid-range Android |
|---|---|
| Cold start to first screen | < 2.5 s |
| Tab switch | < 100 ms |
| Colour change on a wall | < 100 ms, 60 fps pan/zoom |
| Catalogue scroll | 60 fps (FlashList) |
| JS bundle | watch with `npx expo export` — no unused large packages |

## Environments

| | API | Set by |
|---|---|---|
| Development | your computer: `http://10.0.2.2:8080` (Android emulator) or `http://<your-LAN-IP>:8080` (real phone) | `.env` (`EXPO_PUBLIC_API_ORIGIN`) |
| Preview (APK) | staging or production | `eas.json` → `preview.env` |
| Production | `https://api.huevistaa.com` | `eas.json` → `production.env` |

## Builds and release

- `eas build -p android --profile preview` → an APK to install directly, and the link
  for the website's `NEXT_PUBLIC_APK_URL` "HueVistaa for Android" bar.
- `eas build -p android --profile production` → an AAB for Google Play.
- `eas update` → JavaScript-only fixes without a store release.
- iOS follows once Android is stable (needs an Apple developer account).

## Testing

- **Unit:** everything in `src/lib`, `src/api`, `src/auth` (the refresh logic, the role
  router, money and phone formatting).
- **Component:** UI kit states, and each screen's empty/error states.
- **Routes:** `src/__tests__/app-routes.test.tsx` renders the real `app/` folder with
  `expo-router/testing-library`: where each role lands at start-up, what each role may
  open, deep links, offline start-up — and **every planned screen opens without
  breaking**. It uses Testing Library **13.3**: Expo Router 57's test helper renders
  synchronously and breaks with 14's async `render`. Keep them in step.
- **End-to-end (Phase 8):** Maestro flows — sign in with a test number, make a room
  from a ready-made room, take a board; painter scans a test board.
- **Real devices:** one low-end Android (3–4 GB RAM) is part of "done" for every
  studio screen.
