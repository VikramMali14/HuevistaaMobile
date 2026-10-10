# 03 · Signing in and the first run (A1–A11)

How to read a screen spec:
**Route** is the file in `app/`. **Phase** is when it is built (see
[08-roadmap.md](08-roadmap.md)). **Web reference** is the website file that already
does this job — read it before building; its edge cases are already solved there.

---

## A1 · Splash and session restore

**Route** `app/_layout.tsx` + `app/index.tsx` · **Phase** 1

**Why it exists:** open on the right screen without a flash of the wrong one.

**What happens:**
1. The native splash (wordmark on `bgDeep`) stays up while fonts load and the saved
   session is read from secure storage.
2. No tokens → **A2 Welcome**.
3. Tokens → `GET /api/auth/profile`. A 401 triggers one refresh
   (`POST /api/auth/refresh`); if that fails, clear the session → A2.
4. Profile loaded → route by role (see the diagram in [01-product.md](01-product.md)):
   first run → A10; `CUSTOMER` → `/home`; `PAINTER` → `/painter`; anyone else → S10.
5. A page a signed-out person tried to open — a deep link (D1, D2), or the page they
   were on when the session ran out — is remembered and opened after sign-in instead of
   home (after the first run, for a new account). It is kept in memory only, and is
   **not** kept after the person signs out themselves: whoever signs in next on this
   phone may be someone else. The sign-in and first-run screens, the web-only screen
   (S10 belongs to a role, not to a link) and the bare root are never remembered
   (`src/auth/pending-route.ts`).

**States:**
- **Offline with a saved session:** open the role's home from the cached profile with
  the offline banner. Do not sign the person out because the network is down.
- **Slow network:** after 8 s, replace the splash with a quiet "Still connecting…" and
  a Retry.

---

## A2 · Welcome

**Route** `app/(auth)/welcome.tsx` · **Phase** 1

**Why it exists:** say what HueVistaa does in one look, and get the person signed in.

**Layout:**
- Full-bleed room photo slowly cross-fading through shades on the same wall — the wall
  today, Sage, Terracotta, Slate — with a tag naming the shade (the product, shown, not
  described). The frames were rendered with the website's own colour engine
  (`assets/images/welcome/`). Under "Reduce motion" one painted frame stays still.
- Headline: "See your walls in your chosen *colour* — before you paint a single stroke."
- **Continue with mobile number** (primary) → A3
- **Continue with Google** (secondary) → A9 flow
- **Use email instead** (ghost) → A5
- Small print: "By continuing you agree to the Terms and the Privacy Policy" (both
  open the website pages in the in-app browser).
- Footer link: "Run a paint shop? HueVistaa for shops" → website partner page.

**UX notes:** mobile number is first because it needs no password — the fastest path
at a counter. No role question here; that comes after sign-in (A10). Development builds
also show an "Every screen" button that opens the screen index (`app/dev.tsx`).

---

## A3 · Your mobile number

**Route** `app/(auth)/phone.tsx` · **Phase** 1 · **Web reference** `HueVistaaPainter/src/app/sign-in/phone-sign-in.tsx`

**Layout:** title "Your mobile number" · `PhoneField` with a fixed `+91` · line "We'll
text you a 6-digit code." · **Send code** pinned at the bottom.

**Behaviour:** numeric keypad, digits grouped `98765 43210`. The button enables at 10
digits starting 6–9; once ten digits are in and they are not a mobile number, the rule
shows under the field. Sent as `+91…`.

**API:** `POST /api/auth/phone/start { phone }` → `{ phone (masked), expiresInSeconds, resendAfterSeconds }`.

**States:**
- Field error from `fieldErrors.phone` shown under the field.
- 429 → "Too many tries. Wait a few minutes and try again."
- The answer is the same whether or not the number has an account. **Never** say
  "welcome back" or "new number" here — that would let anyone test which numbers are
  registered.

---

## A4 · Enter the code

**Route** `app/(auth)/phone-code.tsx` · **Phase** 1

**Layout:** "We texted a code to +91 98765 43210" · `CodeInput` (6 boxes) · "Resend in
0:42" counting down from the server's `resendAfterSeconds` · "Change number". The number
is shown in full, as typed — it is the person's own, on their own phone, and seeing it is
how a typo is caught before the code never arrives.

**Behaviour:** SMS autofill (`autoComplete="sms-otp"`, `textContentType="oneTimeCode"`),
paste fills all boxes — the digits are picked out of a pasted "123 456" or a whole SMS —
and it submits by itself on the sixth digit. The code is sent once even when the sixth
digit and a tap on Continue land together.

**API:** `POST /api/auth/phone/verify { phone, code, deviceToken?, notMyAccount? }` →
`AuthResponse`. A number the backend has never seen gets a new `CUSTOMER` account in the
same step. Save the tokens, load the profile, route as in A1. `notMyAccount: true` is sent
only from "This isn't my account" below.

**States:** wrong or expired code → shake, the boxes clear, and the backend's own words
under them ("Incorrect code. 2 attempts left.") · an admin's number → "Admin accounts
sign in on the website" · the right code for a number an existing account holds
unconfirmed (409 `PHONE_ON_UNCONFIRMED_ACCOUNT`: nothing is created, and the code is not
spent) → no shake, the boxes clear, "This number is already on a HueVistaa account that
hasn't confirmed it yet…" with **Sign in with email** (→ A5), and under it, quieter,
**This isn't my account — continue**: the same code again with `notMyAccount: true`, and
the backend takes the number off every account holding it unconfirmed (audited), then
makes the new account and signs in as for a number it has never seen. The code still
runs out as usual — if it has by then, that is said at the boxes; a new code sent meanwhile
drops the banner, and the new code is asked about afresh · resend uses
`POST /api/auth/phone/start` again and restarts the countdown on its new
`resendAfterSeconds`; a failed resend is said beside the link, not on the code boxes ·
opened without a number (a stale link, the app restarted part-way) → "We don't know
which number this code is for" with **Enter your number**.

---

## A5 · Sign in with email

**Route** `app/(auth)/email-sign-in.tsx` · **Phase** 1 · **Web reference** `HueVistaFrontEnd/src/app/sign-in/`

**Layout:** Email · Password (show/hide) · "Forgot password?" → A7 · **Sign in** ·
"New here? Create an account" → A6.

**API:** `POST /api/auth/login { email, password, deviceToken? }`.

**Outcomes:**
- Tokens → route as A1.
- `emailCodeRequired: true` (a shop on a new device) → A8 with `challengeToken` and
  `emailHint`.
- `twoFactorRequired: true` (admin accounts) → "Admin accounts sign in on the website"
  with a link. The app does not handle admin sign-in.
- 401 → "That email and password don't match." (Same words for an unknown email — the
  backend does not reveal which accounts exist, and neither do we.) Under it, the
  likeliest reason a right password fails: "If you signed up with Google or a mobile
  number, sign in that way instead — or set a password under Forgot password." Said to
  everyone, so it gives nothing away.
- 429 (the account is locked after failed tries) → the backend's own words, which say
  how long to wait.

Opens with the email filled in when a screen hands one over (A6 "Sign in instead", A7
after a reset).

---

## A6 · Create an account with email

**Route** `app/(auth)/register.tsx` · **Phase** 1 · **Web reference** `HueVistaaPainter/src/app/register/register-form.tsx`

**Layout:** Name · Email · Password (rule shown under it: "At least eight characters, with a
letter and a number" — the backend's rule) ·
Mobile (optional) · **Create account** · "Already have an account? Sign in".

**API:** `POST /api/auth/register { name, email, password, phone? }` → `AuthResponse`.
Then A10 (the role choice).

**States:** 409 "Email already in use: …" → "That email already has an account." with
a **Sign in instead** button that carries the email across. Each field's rule shows
under it after the first try; the backend's `fieldErrors` go under their fields. The
name needs two characters and stops at 80 (the backend's limits). "Already have an
account?" and "Sign in instead" go back to the A5 already underneath, rather than
stacking a second one.

---

## A7 · Forgot password

**Route** `app/(auth)/forgot-password.tsx` · **Phase** 1 · **Web reference** `HueVistaaPainter/src/app/sign-in/forgot/forgot-flow.tsx`

**Two steps on one screen:**
1. "Send the code to" — Email / Mobile segmented. Then
   `POST /api/auth/forgot-password { email }` or `POST /api/auth/forgot-password/phone { phone }`.
   Always answer "If an account uses this, we've sent a code" — same words either way.
2. Code + new password → `POST /api/auth/reset-password { email, code, newPassword }`
   or `POST /api/auth/reset-password/phone`.

**After:** by email → back to A5 with the email filled in and a toast "Password
changed. Sign in with the new one." By mobile → A3 with the number filled in ("Sign in
with a code texted to this number, or your email and the new password" — password
sign-in needs the email, and the texted code is the quicker way back in). Resetting
signs out every other device.

A new code can be asked for after 30 s; "Use a different email or number" returns to
step 1 with what was typed kept. A wrong or expired code (400) shows the backend's words
at the boxes, which clear. No connection, a 429 or a server fault is said in a banner and
the code stays — it may still be good.

---

## A8 · Check your email (shops only)

**Route** `app/(auth)/email-code.tsx` · **Phase** 1

**Why it exists:** a shop account signing in on a device it has not used in 30 days
must confirm an emailed code. Shops mostly use the website, but a shop owner signs in
here to reach their customer profile.

**Layout:** "We emailed a code to s***@example.com" · `CodeInput` · Resend.

**API:** `POST /api/auth/login/email-code { challengeToken, code }`; resend
`POST /api/auth/login/email-code/resend { challengeToken }`. Save the returned
`deviceToken` in secure storage and send it with later sign-ins so the code is skipped
for 30 days. Then S10 (with "Continue as customer" when the profile allows). Each resend
answers with a new `challengeToken` (and hint), which replaces the old one.

**States:** opened without a pending sign-in (a stale link, or the app restarted
part-way) → "This sign-in has expired. Start again from the sign-in screen." with
**Back to sign in**.

---

## A9 · Google sign-in

**Route** `app/sign-in/callback.tsx` · **Phase** 1

**Flow:**
1. A2's button opens `{API}/oauth2/authorization/google?client=mobile` in
   `expo-web-browser`'s auth session, waiting for `huevista://sign-in/callback`.
2. The backend redirects to `huevista://sign-in/callback#code=…` (a one-minute,
   single-use code in the fragment).
3. The app reads `code` and calls `POST /api/auth/oauth2/exchange { code }` →
   `AuthResponse` → route as A1.

The route file exists for the cold-start case, where Android opens the app straight
at the deep link instead of returning it to the waiting browser session. It shows a
"Signing you in…" state while it exchanges the code. Routing never sees a fragment, so
the screen reads the code from the URL that opened the app (and from the query, as a
fallback). The redirect can reach the app twice on Android — once to the waiting browser
session and once as this deep link — so both share one exchange per code
(`exchangeGoogleCodeOnce`).

**States:** the person closes the browser → back to A2, no error. An `error` in the
fragment, no code, or a 400/401 from the exchange → "Google sign-in didn't finish. Try
again." No connection → the usual "No connection" sentence. An admin → "Admin accounts
sign in on the website".

---

## A10 · About you (first run)

**Route** `app/(onboarding)/about-you.tsx` · **Phase** 1 · **Web reference** `HueVistaFrontEnd/src/components/app/welcome-tour.tsx`

**When:** the profile says `namePending` or `welcomePending` — a brand-new account.

**Asks only what is still open, decided once on arrival:** the name only while the
account wears its placeholder (`namePending` — a mobile sign-up). A name typed on A6 or
given by Google is not asked for again, as on the website. The role question only for a
brand-new `CUSTOMER` account that is not a shop's customer profile. With nothing to ask
(a shop's customer profile, a painter who already has a name) the screen shows "Getting
things ready…" and moves straight on. **Not you? Sign out** is always there: someone
who signed in with the wrong Google account has a way out that is not through.

**Layout:**
- "What should we call you?" — name field, two to 80 characters.
- "How will you use HueVistaa?" — two large choice cards:
  - **I'm painting my home** — "Try shades on your own walls and take home a colour
    board."
  - **I paint for a living** — "Scan colour boards for points and get found by
    customers nearby."
- When the painter card is chosen, a note appears: "A painter account is for work.
  You can't use it to plan your own rooms — that needs a separate account."
- **Continue**.

**API:** `PATCH /api/auth/profile { name }` when the name changed. Painter →
`POST /api/painters/me`, then `POST /api/auth/welcome/seen` (its answer is the reloaded
profile, now `PAINTER`) → `/painter`, or the page remembered in A1. The tour is a
customer's, so a painter's first run ends here. Customer → A11.

**States:** `POST /api/painters/me` refused (the account already has rooms or a shop
code) → show the backend's reason and keep them as a customer. Connection lost after
becoming a painter → the error, and **Continue** again finishes the job (becoming a
painter twice is a no-op).

---

## A11 · Quick tour (customers)

**Route** `app/(onboarding)/tour.tsx` · **Phase** 1

**Layout:** three swipeable cards with a real room picture each (the Welcome rooms;
the board card also shows the three shades it would carry), "Step 1 of 3", dots,
**Next**, **Skip** top right (not on the last card):
1. "Photograph a *room*." — the camera does the rest.
2. "Try any *shade*." — on your own walls, as many as you like, free.
3. "Leave with one *board*." — every shade code, ready for the counter.

Last card has two buttons: **Start** → `/home` (or the page remembered in A1), and
**I have a code from my shop** → C30.

**API:** `POST /api/auth/welcome/seen` on Start, Skip or the shop-code button — all
three count as shown. Leaving is instant and the write happens behind the next screen.
If it does not get through, the first run is still over on this phone, and the session
sends it again at the next start (`hv.welcomeSeenPending`) — so a dropped request never
asks the role question a second time. "Show me around" in S1 replays it (an account whose first run
is over: nothing is written, and Start goes back).
