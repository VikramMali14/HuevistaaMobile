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
`expo-location`, `@shopify/flash-list`, `react-native-webview`, `qrcode` (its core only,
for the board's QR). Always add them with
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
│   │   ├── boards/                   #   making, keeping and sending colour boards (Phase 4)
│   │   ├── payments/                 #   checkout, verification, the payment kept (Phase 4)
│   │   ├── ai-images/                #   the one ask, images being made, the picture kept (Phase 5)
│   │   └── painter/                  #   points, rewards, listing, board reader (Phase 6)
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

As built (`src/features/payments`):
- One counter for everything: `POST /api/billing/cart/order` with the basket packed by
  `lib/cart-pack` (ported from the website), credits alone included. `pay-link.ts` builds
  the page's address and parses its answer — ids checked against Razorpay's shapes, a
  success believed only once verified.
- `pending-payment.ts` keeps `{ accountId, orderId, amount, rooms, credits, basket }` in
  AsyncStorage while the browser is open (`basket` is what was asked for, for Try again),
  and the proof (`paymentId`, `signature`) once Razorpay says paid, until the server
  confirms it. Only that account sees it — or, for a proof that came back while signed out
  with no order kept, the next account to sign in (`accountId: ""`; the server checks the
  order is theirs). An unpaid order older than two hours is forgotten, a paid proof after
  a week; sign-out drops an unpaid order and keeps a paid proof.
- `payments.ts` settles an answer: one verification per payment, shared between the
  waiting browser session and D3's deep link (Android can deliver both). A verification
  that fails after a success is `checking` — reported as VERIFY_FAILED, tried again by
  C29, and C27/C28 say a payment is being confirmed and C28 disables Pay. Verifying again
  is safe: the backend answers a payment it already redeemed for this account as a
  success. A refusal for good (a 4xx other than 401/408/429, and other than the 403
  "Payment verification error." that means Razorpay couldn't be asked) is `refused`: the
  proof goes, so Pay works again, and C29 gives the reason and the reference. OPENED,
  ABANDONED (only for the page's own "cancelled") and FAILED (with Razorpay's code and
  reason) are reported too, and never throw.
- Before anything opens, the order's `amountPaise` is checked against the total the basket
  showed; a different one throws `PriceChangedError` and re-reads the counter.
- The browser session is opened with `preferEphemeralSession` (no iOS "wants to use … to
  sign in" alert). On Android it can end as "dismissed" a moment before the redirect
  carrying the answer arrives, so the app also listens for the link itself and waits
  2.5 s for a late answer; a success always wins over a cancel, a failure or silence. A
  browser closed with no answer is `unfinished`, not "cancelled": the order is kept (a
  late answer can still settle it) and the balances are read again.
- D3 reads the opening link through `use-opening-url.ts` (routing never sees a fragment).
  While the app's own checkout is waiting it hands the answer over and steps aside; a
  cancel or failure just after a checkout settled is its echo; on a cold start it settles
  the kept order itself.

## The colour engine (the biggest risk)

`src/features/studio/engine/`. The website's `lib/webgl-recolor.ts` shaders (`VERT`,
`FRAG`) are copied **unchanged** into `shaders.ts` (checked character for character), so a
wall reads the same colour on the phone as on the website: multiplicative shading anchored to
the cleaned photo, the form/detail split, the one-pixel antialiased mask edge. The
studio's fixed settings come with them (`paint-model.ts`): paint follows the photo's
light at 85%, detected walls grow one photo pixel (the edge nudge), drawn walls none,
catalogue shades paint at their measured LRV. The studio passes no white point or relief
map (nor does the website's), so of `canvas-light.ts` only `REF_WHITE` is needed.

What the website did on a 2D canvas runs as GPU passes in `recolor-gl.ts` (`RecolorGL`,
one per `expo-gl` context):

- **The form layer** — the canvas's `filter: blur(r)` becomes a separable Gaussian of
  sigma r at a quarter of the photo's size (`BLUR_FRAG`).
- **The edge nudge** — `mask-feather.ts`'s `offsetCoverage` as `NUDGE_FRAG`, which also
  normalises every mask to opaque white-on-black (red × alpha).
- **Tapping a wall and each wall's light** — small copies (192 px) read back with
  `readPixels`; `wallAt()` and `meanLumaInMask()` work on those (unit-tested).
- **Before and after** — the walls are drawn right of a scissor line, so a snapshot of the
  view is the comparison itself.

Pictures reach the GPU through `texture-loader.ts`: on a phone the bytes are fetched once
into the cache's `studio/` folder (`fetchMedia()`, with the session for the backend's own
files) and handed to `expo-gl` as `{ localUri }`; the web build decodes an `<img>`. A
download is written beside its name and moved into place when whole, a cached file that
won't decode is fetched again once, and the folder is deleted on sign-out. A photo or
wall that fails to load says so with Try again (`CanvasTrouble`, the canvas's `retry()`). Masks come through the
backend's own mask route (with the session: no expiring link, no CORS), cached by the
stored file they name. `RoomCanvas` lays the GL view out at the photo's aspect ratio and is
used by C9, C10, C11, C14 and the live-colour check.

**The live-colour check** (`app/(account)/engine-check.tsx`; Settings → press and hold the
version) paints a sample room bundled with the app — the welcome photo and two wall masks
taken from its own repaints — 60 times, timing each change with `gl.finish()`, and passes
when 95% are under 100 ms. In a phone-sized Chromium it passes easily, which says nothing
about a phone: **it has to be run on a real mid-range Android.** If it fails, the fallback
is `@shopify/react-native-skia` runtime shaders (SkSL — the shader needs translating). With
no WebGL 2 at all the canvas says so and the rest of the studio still works.

**Editing masks (C10)** happens on the GPU too: a wall's mask is redrawn at the photo's
size, and strokes (discs joined by quads) and shapes (ear-clipped, so an L fills as an L)
are drawn into it from a list of operations — Undo is a shorter list, so history costs no
GPU memory. Every wall's list is kept in React state, never only on the GPU: the engine
holds each mask as loaded and draws the edited copy from the list (`applyEdits`), so a
canvas that starts over (a new size, a lost context) draws the same edits again. Saving
works the mask out from the loaded one and the list alone (`bake`), reads it back at full
size and encodes an 8-bit greyscale PNG in JS (`mask-ops.ts`, `fflate` for the deflate; a full-size mask is tens of KB), well
under the backend's limit of about 4 MB of base64.

## The studio's state

- **The room** — `useRoom(id)` (`GET /api/projects/{id}`), shared by every step through
  the query cache; C8's poll writes each answer into the same entry. Polling is every 2 s,
  5 s after a minute, paused in the background, at once on return.
- **The colours** — `paint-store.ts`, per room: colours per wall, the selected wall (always
  one being painted), an Undo history, and the changes not yet saved. C11, C12 and C13
  all write to it. Saved colours are read as the website reads them (`saved-colours.ts`):
  the catalogue shade found again by code, else by exact hex, so a wall paints at its LRV;
  a found wall still on the backend's opening colour is snapped to the nearest shade of
  Asian Paints (or the company with the most shades). A change is saved 600 ms after the
  last one (`PUT /regions`, HV codes — the backend maps them back), and at once when the
  app goes to the background; a failed save keeps the changes, says so, and tries again
  in 10 s or as soon as the phone is back online. A refusal (a 4xx that trying again won't
  change: the room closed or went) is not retried: the walls go back to what is saved and
  the server's sentence is shown. A refetch never undoes a tap still waiting to be saved;
  deleting a room forgets its colours and tray.
- **Recent shades** and **the board tray** (combinations kept until a board is made,
  Phase 4) live on the phone; **which rooms were painted here** decides whether a room
  opens on Walls or Paint. All of it is cleared on sign-out and on a switch of profile.
- **The photo upload** — `photo-upload.ts`: C6 shrinks the photo (2048 px, JPEG 0.85) and
  starts the upload; C7 shows its progress (XHR, so it can) and creates the room when it
  is done. A 422 (not a room) asks for a retake rather than a retry.

## The colour board PDF

`lib/pdf-core.ts` is a small hand-written PDF writer and `lib/pdf-export.ts` lays out
the board. Both are plain TypeScript apart from a few canvas helpers, so they port.
Page images come from GL snapshots (`GLView.takeSnapshotAsync`) as JPEG. The file is
written with `expo-file-system` and shared with `expo-sharing`.

As built: both are ported (`src/lib`), taking JPEG **bytes** and returning the file's
bytes. C15's one canvas photographs each option (`RoomCanvas.snapshot(only)` paints exactly
those colours, then puts the screen back); a page with no picture prints the option's
swatches in the photo's place, so no recorded page is ever missing from the file. The
reward page's QR is `qrcode`'s core (`create(url, { errorCorrectionLevel: "Q" })`), drawn
as vector rectangles as on the website. `features/boards/board-run.ts` is the website's
`colour-board-download.ts`: build → charge → hand over, refusals (any 4xx) obeyed, silence
(no answer, a timeout, a 5xx) failing open. `board-files.ts` writes each board into its
own folder under the app's documents (`boards/{room}/{time}/`), keeps it only once handed
over (the room's earlier board then goes), throws a refused one away, and deletes the lot
on sign-out; `made-boards.ts` remembers each room's last board for C16 and C25. Save to
phone on Android writes a copy into a folder picked with `Directory.pickDirectoryAsync()`.
The browser preview keeps boards as in-memory links (`board-files.web.ts`).

After the Phase 4 audit:
- Files are kept as their place inside the documents (`boards/…`), resolved by
  `boardUri()` on use: iOS changes the documents' own path when the app updates.
- `made-boards.ts` writes only after the boards of earlier runs are read in (writing
  before replaced every other room's record), and a sign-out can't be undone by a read
  still under way.
- C15 makes the board only once every wall's mask has loaded (`RoomCanvas` reports
  `loading`), holds back while it runs, and doesn't wait for the room refetches after the
  hand-over. A charge that went unanswered keeps the tray. What's recorded with the charge
  is kept within the server's limits (16 walls a page, label 255, name 160, code 64,
  `#rrggbb`).
- The printed text is in `src/i18n` (`pdf.*`). The board's base-14 fonts print Latin
  letters only, so a room name in another script prints as "Your room" (`pdfPrintable`).
- Known limit: a page's picture is the size of C15's preview canvas (`takeSnapshotAsync`
  of the view), not the photo's; the website renders up to 1500 px. A larger render needs
  an offscreen framebuffer read back as JPEG, to be checked on a real phone before it
  ships. Wall names typed in another script print as "?" for the same font reason.

## AI images

The server spends an image's credits inside `POST /api/projects/{id}/renders` and has no
idempotency key: every request is a new charge.

- `features/ai-images/start-render.ts` sends it at most once. It isn't sent while
  `onlineManager` says the phone is offline: a React Query request started offline waits
  until the phone is back online, so the request is called directly. Every reply is obeyed
  (4xx: nothing spent).
- Silence (a timeout, no connection, a 5xx) is reconciled, never retried. The room's images
  are read just before the ask and again 0, 2 and 5 s after it. An image matching the ask
  (option, every choice, the note) that wasn't there before, or is still being made, is
  this one. Without the list from before, only one still being made, or one that ended
  since the ask, counts. Otherwise C23 says the outcome is unknown and watches the list.
- `in-flight.ts` is a small store of the images being made that this run knows of: asked
  for here, or opened while being made. It also holds when each started by the phone's
  clock: the ask's own moment, else the server's `createdAt` clamped between the first
  sight and 25 minutes before.
- `RenderWatcher`, mounted once in `app/(customer)/_layout.tsx`, polls each image with
  `useQueries` (2 s, then 5 s after a minute, then 15 s after 9½ minutes; React Query
  pauses it in the background). When one ends or is gone, it is dropped, and
  `renderChanges(projectId)` in `query-keys.ts` is invalidated: the wallet, the shelf, and
  the room's images and options (`exact`, so one image's own key is not refetched). C24
  reads the same query without polling it.
- A finished image's query is never stale by itself: its picture's address is presigned
  again on every read (valid an hour), so C24 reads it again only when a picture fails.
  `expo-image` keys the picture by image (`cacheKey: render-{id}`), not by address.
- `render-files.ts` fetches the picture once per image into `cache/ai-images/` (shared by
  Send, Save and the PDF). It times out after 60 s and keeps only a whole JPEG (FF D8),
  written beside its name and moved into place. A kept file that isn't one is fetched
  again. A sign-out bumps a generation counter, so a fetch still running writes nothing.
  The folder is deleted on sign-out. Saving goes through `expo-media-library/legacy` with
  `requestPermissionsAsync(true)` (write only). The browser preview downloads instead
  (`render-files.web.ts`).

## The painter (Phase 6)

Points, rewards and the painter's profile are read with React Query (`use-painter.ts`;
keys in `query-keys.ts`). What a claim changes (`claimChanges`: wallet, catalogue) and what
a redemption changes (`redeemChanges`: also the vouchers) are invalidated whatever the
answer. Server times carry no zone and are India's wall clock (`serverMoment` in
`lib/dates.ts`). Days left are counted as the website counts them (rounded up); "today"
and "tomorrow" go by the date in India.

Money and points:
- **Claim** (`POST /api/rewards/{token}/claim`) has no key. A refusal re-reads the board
  and shows how it stands. Silence is reconciled, never retried: the points and the board
  are read again, and it counts as landed only when the board no longer reads claimable
  and a board credit for that much has appeared since the ask (`claimLanded`).
- **Redeem** carries a `requestKey`. `RequestKey` keeps one across retries of the same
  press and makes a new one once a redemption comes back, so a lost answer is retried
  safely: the server answers a repeated key with the redemption it already made.

**The board reader (P7).** A board's PDF is read on the phone, never uploaded.
- `scripts/board-reader/reader.js` runs in a page beside pdf.js 4.10.38 (legacy build, its
  worker run in the page) and jsQR 1.4.0 (both pinned exactly, devDependencies).
  `scripts/build-board-reader.mjs` puts them in one ASCII page under 2 MiB:
  `src/features/painter/board-reader/reader-html.generated.ts`, committed, with the
  sha-256 of everything it was built from. `board-reader-generated.test.ts` fails when the
  committed page is out of step with them.
- The page's content security policy shuts the network off (`connect-src 'none'`). Native:
  a hidden `react-native-webview` (no files, no storage, no other page; every URL passes
  the allowlist so none is handed to the browser, and all but `about:` are refused). Web: a
  sandboxed `srcdoc` iframe (`allow-scripts` only). The page is a lazy import, its own
  chunk on the web.
- `board-reader/protocol.ts` is the conversation: the file goes in 256 KiB base64 chunks,
  each acknowledged; the page reports each page it starts and offers every QR text it
  reads; the app answers whether it's ours (`rewardTokenFrom`) and the page reads on after
  a no. Pages are read last first, then the first, then backwards, at 1400 and 2200 px
  wide; the first two looked at are also cut into four overlapping tiles at 3200 px. No
  canvas goes over 16 MP (iOS). Drawn with pdf.js's print intent, which doesn't wait on
  animation frames a hidden WebView may never give. 60 s without a word from the page is
  a failure.
- `scripts/verify-board-reader.mjs` proves the page in Chromium: a real colour board
  (`scripts/board-reader/fixtures/colour-board.pdf`, from the studio's own builder) gives
  its token from its last page with nothing fetched; a photo of that page does too; another
  QR is refused and the reading carries on; no QR, not a PDF, and a broken image each end
  as they should.
- **Open with HueVistaa.** Android: a `VIEW` intent filter for `application/pdf` on
  `content://`. iOS: the PDF document type (`LSHandlerRank` Alternate, copied into the
  app). `app/+native-intent.tsx` holds the file (`shared-board.ts`, memory only) and opens
  P7, which reads it at once. A board link or file opened while signed out is remembered
  through sign-in (`pending-route.ts` keeps the deeper path when a guard reports only its
  own segment on the way out).

## Nearby, community, help and links (Phase 7)

Each area has an endpoint file (`nearby.ts`, `community.ts`, `support.ts`, `share.ts` in
`src/api/endpoints`) and a feature folder. Keys live in `query-keys.ts`. Anything read
under `me` goes with the account on sign-out, as all of the cache does.

The rules for every write:
- **Check first.** What the server would refuse is refused on the phone, with the
  server's own trimming and space folding (`cleanBody`, `cleanName` mirror
  `CommunityText.clean`; Java's `\s` is ASCII only). Most of these limits count per
  network, and one refused send still counts.
- **Never send twice.** A send with no answer is looked for before anything is said:
  - a review: the board read again (an edit must match what was sent);
  - a question: the account's own questions;
  - a support start: a conversation with the same first message that wasn't on the list
    before the ask (`startedChat`);
  - a support message: the conversation.

  Each counts as sent only when found. A support send is looked for every 5 s until it
  can no longer land (`lookFor`, 140 s from the send). The server answers inside the
  transaction that saves the message, so a send can't be seen until its answer is in. A shared room's copy is never looked for or sent
  again; the visitor is pointed to their rooms.
- **Refusals in the server's words.** `messageFor` shows a 4xx sentence as it came; a
  server's internal wording ("Project not found: …") is replaced where it would leak an
  id.

**Nearby (C32).**
- `locate.ts` returns one of four outcomes: a fix, refused (and whether Settings is the
  only way), location off, or failed. It asks once, takes a fix up to 60 s old, then a
  fresh one raced against 15 s.
- `searchPoint` rounds to 3 decimals before anything is sent.
- The lists keep for 5 minutes and don't reload on focus or reconnect. They are tried
  again once, and only when there was no answer: the 60-an-hour allowance is shared by
  both lists.
- A painter's number is a query that runs only on **Call**. It is never stale and never
  dropped for the session, so it is asked for once against the 20-a-day allowance. It
  runs in `networkMode: "always"`, so offline it fails at once rather than pausing and
  dialling when the signal returns. One press makes one call (`useSubmit`), and nothing
  dials once the card has gone (`useAlive`).
- `NearbyCards.tsx` is shared with P5's preview.

**Reviews (C26, D1).**
- `BoardReviewScreen` is one screen for both routes. C26 first asks for the room's
  board code (`GET /api/community/reviews/project/{id}`).
- D1 works out the role and hands over: P6 for a painter, the review for a customer, the
  website for a shop.

**Support (S6, S7).**
- The assistant answers inside the request, so a start and a message wait up to 130 s
  (the server allows 120).
- S7 reads the conversation every 5 s while it's on screen (`refetchInterval`). It stops
  for a send, on a 404, once the conversation is resolved, and while another screen
  covers it (`useIsFocused`). It pauses while the app is in the background
  (`focusManager`, wired to `AppState`). New replies are announced
  (`announceForAccessibility`).
- A send cancels any read in flight and shows the message at once, with a typing bubble
  unless the team has it.

**Questions (S8).** One `FlashList` over an infinite query of 20 a page, de-duplicated
by id across pages. The ask form and the account's own questions sit in its header.

**A shared room (D2).**
- `shareApi` reads without a token, so a signed-out phone can open it. The masks come
  from the link's own route (`maskPath`).
- `canvasWalls` takes the mask route and a cache scope (`share:{token}`), so a shared
  room's textures never mix with the owner's own room if both are opened on one phone.
- Colours come only from the link's companies (`/brands`, then `/shades?brand=` one at a
  time), coded as the link's scheme says.
- Whether the room is the viewer's own: `GET /api/projects/{id}` answers for the owner and
  is a 404 for anyone else.

**App Links.**
- `app.json` has an `autoVerify` intent filter for `https://huevistaa.com` paths `/r/`
  and `/share/`.
- `app/+native-intent.tsx` matches only those two shapes (a code of 16–64 URL-safe
  characters) and drops a query or fragment. Anything else goes on as it came.
- The website (HueVistaFrontEnd, `src/app/api/app-links/android/route.ts`, rewritten
  from `/.well-known/assetlinks.json`) answers with the statement for
  `com.gridstore.huevistaa`. The fingerprints come from `ANDROID_APP_CERT_SHA256`
  (comma-separated: the upload key and Play's signing key), and it answers 404 until they
  are set.
- iOS (`associatedDomains`, `apple-app-site-association`) waits for the Apple Team ID.

## Polish and release (Phase 8)

**Language.**
- `src/i18n`: `t()` reads the current language and falls back to English key by key.
  `tEn()` is for anything printed: the board's and the AI image's PDF font has Latin
  letters only. `plural()` follows Hindi's rule, where nought takes the singular.
- `hi.ts` is typed `Translation`: every English key except `pdf` and `dev`, so a missing
  one fails the build. A test checks every placeholder matches.
- `language.ts` keeps the choice on the phone (`hv.language`; absent means follow the
  phone, through expo-localization). It is read before the splash hides.
- Screens read their strings as they draw, and React Navigation's `StaticContainer`
  keeps them from drawing again on their own. So a new language remounts the root
  navigator (`key={language}` in `app/_layout.tsx`), with the session, cached data and
  toasts above it carrying on. `landNextOn("/settings")` brings S1 back once,
  through `app/index.tsx`.
- Hindi uses `hindiTypeScale`: no tracking, and line heights of at least 1.5× for
  Devanagari's vowel signs. The glyphs come from the phone's own Devanagari font,
  because Inter has none.
- What stays English: the server's own sentences (some code matches them), the PDFs,
  shade codes, and names.

**Push notifications** (`src/features/notifications`, through Expo's push service):
- `registerPush(userId)` gets the Expo token only when notifications are already
  allowed, on a real device with an EAS project. It never asks. It sends
  `POST /api/me/push-tokens {token, platform, locale, appVersion}` once per start, and
  again on a change of account, token or language. `usePushRegistration` runs it
  from the root, keyed on the signed-in id.
- Signing out by choice calls `unregisterPush()` before `logout`, inside the same 3 s
  race. `forgetPush()` runs with the rest of an account's data on sign-out and on a
  switch: it dismisses the account's notifications and resets the registration.
- `push-routes.ts` is pure. `readPayload` accepts only known kinds with well-formed ids,
  and `pathFor` builds the screen from those ids: a notification never carries a path.
  `invalidationsFor` lists what each kind makes stale.
- `usePushObserver`, from the root:
  - With the app open, a notification refreshes what it made stale, for the signed-in
    account only.
  - Taps (warm, or the last response on a cold start) wait in a small external store
    until the session is known and the screens are up. They open with `router.push`
    for the account they were sent to; others are dropped. Each is handled once, by
    its notification id.
- `setNotificationHandler`: no banner for a reply to the support chat already on
  screen (`setQuietConversation`).
- Android channels: `rooms`, `points` and `support`, named in the current language and
  made before any ask (Android 13 shows no prompt without one).
- `AskForNotifications` (X3) shows a sheet before the phone's prompt, at most once per
  reason, at the four moments that wait: C8 finding walls, C24 making an AI image, P11
  a voucher just redeemed, and S7 once the team has the chat. S1's Notifications row
  asks there, or opens the phone's settings.

**X5 · update needed** (`src/features/app-update`):
- `loadVersionGate()` decides at start-up from the last answer kept on the phone
  (`hv.minVersion`), so it never waits on the network. It fetches
  `GET /api/mobile/version` (public, 4 s) behind that and keeps the answer for the
  NEXT start, so a raised minimum never stops someone mid-task.
- `gateFor` blocks only when the installed version (expo-application, never
  app.json) is below the minimum and there's an https store link. It fails open on
  anything it can't read.
- Root renders `UpdateNeeded` in place of the navigator.

**Crash reports** (`src/lib/crash-reports.ts`, Sentry):
- Off without `EXPO_PUBLIC_SENTRY_DSN`, on the web and in development.
- `sendDefaultPii: false`, no screenshots or view hierarchy, no tracing. Session
  tracking gives crash-free sessions per version.
- `scrubEvent` and `scrubBreadcrumb` take out emails, phone numbers, bearer and push
  tokens, query strings and long path segments (board and share codes, ids). They
  drop typed input and request bodies, and keep only the user's id.
- The root `ErrorBoundary` reports a screen that throws while drawing and offers Try
  again. The query and mutation caches report failures that aren't the server's answer.
- `metro.config.js` adds Sentry's debug ids. The Expo plugin uploads source maps at
  build time with `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`.

**Builds:**
- `expo-updates` with `runtimeVersion: {policy: "appVersion"}`, and a channel per EAS
  profile. `eas update:configure` adds the update URL once there is an EAS project.
- A `development` profile builds a dev client, because Expo Go can't receive remote
  notifications.
- app.json carries the notifications plugin and icon (`assets/images/notification-icon.png`,
  white on transparent, from the mark's grid), Hindi permission sentences for iOS
  (`locales/hi.json`), iOS export compliance, a privacy manifest, and
  `applinks:huevistaa.com`.

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
- The request that spends an AI image's credits is never queued or retried. Offline, it
  isn't sent; an unanswered one is reconciled from what the server shows afterwards.
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
- `eas update --channel production` → JavaScript-only fixes for the same native version
  (runtimeVersion follows the app version).
- `eas build --profile development` → a dev client, needed to try notifications.
- iOS follows once Android is stable (needs an Apple developer account). The whole
  release, in order, is in [09-release.md](09-release.md).

## Testing

- **Unit:** everything in `src/lib`, `src/api`, `src/auth` (the refresh logic, the role
  router, money and phone formatting).
- **Component:** UI kit states, and each screen's empty/error states.
- **Routes:** `src/__tests__/app-routes.test.tsx` renders the real `app/` folder with
  `expo-router/testing-library`: where each role lands at start-up, what each role may
  open, deep links, offline start-up — and **every planned screen opens without
  breaking**. It uses Testing Library **13.3**: Expo Router 57's test helper renders
  synchronously and breaks with 14's async `render`. Keep them in step.
- **End-to-end:** Maestro flows in `.maestro/`: a customer from a ready-made room to a
  colour board; a painter typing a board's code to its claim; Settings to Hindi and
  back. They sign in with email and a password, because a texted code can't be read
  by a test, and run against a staging backend, never production, from
  `.github/workflows/e2e-android.yml` (manual and nightly). The data and secrets they
  need are in [09-release.md](09-release.md).
- **CI:** `.github/workflows/ci.yml` runs typecheck, lint and the tests on every push
  and pull request.
- **Real devices:** one low-end Android (3–4 GB RAM) is part of "done" for every
  studio screen.
