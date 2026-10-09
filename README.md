# HueVistaa Mobile

The phone app for [HueVistaa](https://github.com/VikramMali14/HueVista) — see your walls in
your chosen colour before you paint a single stroke.

One app, two people:

- **Homeowners** photograph a room, try real catalogue shades on their own walls, and
  leave with a colour board to take to the counter.
- **Painters** scan colour boards for points, spend them on kit, and get found by
  customers nearby.

Shops, distributors and admins keep using the website.

Built with **Expo SDK 57**, React Native 0.86, TypeScript and expo-router.

---

## Status

**Phase 0 — foundation — is done.** The project, theme, UI basics, API client with safe
token refresh, sign-in session, role-based routing, and a placeholder for every one of
the 69 planned screens.

**Phase 1 — signing in and the first run — is done.** Welcome, mobile number and code,
email sign-in, create an account, forgot password, a shop's emailed code, Google
sign-in, About you, the tour, and the web-only screen — and a link opened while signed
out comes back after sign-in.

**Phase 2 — Home, catalogue, account — is done.** Home with the one next step, the
shade catalogue (search by code or colour word, works offline), a shade's own page,
ready-made rooms, adding a shop code, the shop's products, Account, and the account
screens: settings, name, email, mobile number, password and deleting the account.
Audited end to end since; what was found and fixed is listed in the roadmap.

**Phase 3 — the studio — is built.** The website's colour engine running live on the
phone (expo-gl), your rooms, adding a photo (camera or gallery, shrunk and uploaded while
the room is named), Tidy up, the walls found, painting them, the shade picker, suggested
palettes, before and after, adjusting walls by hand and reporting walls that are wrong.
One thing is left for a real phone: Settings → press and hold the version → run the
live-colour check (each colour change should show in under 100 ms).

**Phase 4 — boards and payments — is built.** Choose and confirm a colour board (made on the
phone in the website's order: reward code, the PDF built and written, then the charge),
board ready with send and save, the Boards tab, a board's detail (where a finished room
now opens), sharing a room, rooms and credits, checkout through Razorpay on the website's
`/pay/mobile` page, the payment result, and the payment return for when Android stops the
app mid-payment. Left for a real phone: make a board on `expo-gl`, and a Razorpay test
payment including the cold start.

**Phase 5 — AI images — is built.**
- Choose a room and the option to photograph.
- Choose how it is photographed, with each quality priced from the wallet. If credits
  are short, buy them.
- The ask is sent once. If it goes unanswered, the app checks whether the image started
  and never asks again on its own.
- The wait can be left: a watcher brings the image's end to the AI images shelf, the room
  and the wallet.
- Ready: send the image, save it to the photos, or send it as a PDF with its shades.
  Failed: the server's reason, and Try again with the same choices.

Left for a real phone: a real image end to end, with the share sheet and saving to the
photos.

**Phase 6 — the painter — is built.**
- Home, points with each batch's expiry, and the newest movements.
- Scan a board's QR, type its code, or open its PDF: the PDF is read on the phone (pdf.js
  and jsQR in a hidden WebView, no network) and only the code is sent. PDFs open with
  HueVistaa from other apps.
- Claim a board: an unanswered claim is checked against the points, never repeated.
- Rewards priced against the balance, redeemed with a key that makes a retry safe, and
  vouchers with their codes.
- Be found nearby (a rough location and a line about you), the trade profile, and C33 for
  a customer becoming a painter.

Left for a real phone: the camera on a printed board, the reader on Android and iOS, and
"Open with" from WhatsApp.

**Phase 7 — nearby, community, help and links — is built.**
- Painters and shops near you, found from the phone's location rounded to ~100 m. A
  painter's number is asked for once, on Call, and kept. Directions open the phone's
  maps.
- Review the job from a room or a board's QR, checked as the server checks it. A board's
  link sends a painter to claim, a customer to review, and a shop to the website.
- Help: an assistant that answers at once, a person on request, and common answers.
  Questions and answers, with your own questions and where each stands.
- A shared room repainted on the phone with the link's own colours, and copied into your
  rooms once, after a confirm.
- Android App Links for `huevistaa.com/r/*` and `/share/*`. The website serves the
  statement once the signing fingerprints are set.

Left for a real phone: the location prompts, App Links on a signed build, and handing
over to the dialler, WhatsApp and Maps.

**Phase 8 — polish and release — is built.**
- Hindi throughout, chosen in Settings or following the phone; print stays English.
- Push notifications: walls ready, an AI image ready, a voucher settled, a support
  reply. Asked for only at the moments that wait, and opening the right screen for the
  right account.
- An update-needed screen when a version is retired, deciding from the last answer
  kept on the phone and never blocking mid-task.
- Crash reports through Sentry, with everything personal taken out first. Off until a
  DSN is set.
- Over-the-air updates (expo-updates), a development build profile, iOS
  configuration, CI, and Maestro end-to-end flows for a staging backend.

What's left before the stores is decisions and accounts, not code in this repo. That
covers how rooms are sold in store builds, Sign in with Apple, the Expo, Firebase,
Sentry, Apple and Play accounts, a staging backend, and a native Hindi read. All of it
is in [docs/09-release.md](docs/09-release.md).

## The plan

Everything is planned page by page in [`docs/`](docs/README.md):

| | |
|---|---|
| [01 · Product](docs/01-product.md) | Users, roles, navigation map, the rules every screen follows |
| [02 · Design system](docs/02-design-system.md) | Ink, paper and brass — colours, type, components, voice |
| [03 · Signing in](docs/03-screens-auth.md) | A1–A11 |
| [04 · Homeowner](docs/04-screens-customer.md) | C1–C33 |
| [05 · Painter](docs/05-screens-painter.md) | P1–P12 |
| [06 · Shared, links, states](docs/06-screens-shared.md) | S1–S10, D1–D3, X1–X6 |
| [07 · Architecture](docs/07-architecture.md) | Code layout, API, sign-in, payments, colour engine, security |
| [08 · Roadmap](docs/08-roadmap.md) | Build order, checklist, changes needed in the other repos |
| [09 · Release](docs/09-release.md) | The owner's decisions, store listing, data safety, review access, end-to-end tests |

## Run it

You need Node 22 and either the **Expo Go** app on an Android phone or an Android
emulator.

```bash
npm install
cp .env.example .env      # point EXPO_PUBLIC_API_ORIGIN at your backend
npm start                 # then press "a" for Android, or scan the QR with Expo Go
```

- Android emulator → backend on this computer: `http://10.0.2.2:8080`
- A real phone on the same Wi-Fi: `http://<this computer's LAN IP>:8080`

Expo Go can't receive push notifications and lacks Sentry's native module. To try those,
build a development client once (`eas build --profile development -p android`), install
it, and run `npm start` against it.

### Preview in a browser (no phone needed)

```bash
npm run web               # opens the app at http://localhost:8081
```

Set the browser to a phone size (DevTools → device toolbar, e.g. 390 × 844). The app
is not shipped on the web; this is for looking at screens while they are built. Sign-in
in the browser keeps tokens in memory only (`src/auth/token-store.web.ts`), so a reload
signs the preview out.

### Walk through every screen without a backend

In a development build, every placeholder has an **Every screen** button (it opens
`/dev`). There you can **preview as** a customer, a painter or a shop to open the
screens each role is allowed into, and see which screens are built.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the development server |
| `npm run android` | Start and open on Android |
| `npm run web` | Preview the screens in a browser |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint (Expo's rules) |
| `npm test` | Jest + Testing Library |
| `npm run check` | All three — run before every push |
| `npm run doctor` | Expo's project health checks |

## Building

```bash
npx eas build -p android --profile preview      # an APK to install and share
npx eas build -p android --profile production   # an AAB for Google Play
```

The preview APK is what the website's `NEXT_PUBLIC_APK_URL` ("HueVistaa for Android")
should point at.

## How the code is organised

```
app/        every file is a screen (expo-router); route groups guard by role
src/api     the API client, endpoints, types, error messages
src/auth    session, tokens, the role router, guards
src/components/ui   the design-system components
src/theme   colours, type, spacing — from the website's globals.css
src/i18n    every user-facing string
src/lib     pure helpers (money, validation, code ported from the website)
src/navigation/screens.ts   the registry of every planned screen
docs/       the plan
```

Conventions are in [docs/07-architecture.md](docs/07-architecture.md#folder-structure).
The short version: screens stay thin, logic is tested in `src/`, every string goes
through `t()`, every amount through `formatRupees()`, and no screen is "done" until its
empty, error and offline states are.
