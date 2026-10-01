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
5. A deep link that opened the app (D1, D2) is remembered and opened after this.

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
- Full-bleed room photo slowly cross-fading between two shades on the same wall (the
  product, shown, not described). Use the website's sample room images.
- Headline: "See your walls in your chosen *colour* — before you paint a single stroke."
- **Continue with mobile number** (primary) → A3
- **Continue with Google** (secondary) → A9 flow
- **Use email instead** (ghost) → A5
- Small print: "By continuing you agree to the Terms and the Privacy Policy" (both
  open the website pages in the in-app browser).
- Footer link: "Run a paint shop? HueVistaa for shops" → website partner page.

**UX notes:** mobile number is first because it needs no password — the fastest path
at a counter. No role question here; that comes after sign-in (A10).

---

## A3 · Your mobile number

**Route** `app/(auth)/phone.tsx` · **Phase** 1 · **Web reference** `HueVistaaPainter/src/app/sign-in/phone-sign-in.tsx`

**Layout:** title "Your mobile number" · `PhoneField` with a fixed `+91` · line "We'll
text you a 6-digit code." · **Send code** pinned at the bottom.

**Behaviour:** numeric keypad, digits grouped `98765 43210`. The button enables at 10
digits starting 6–9.

**API:** `POST /api/auth/phone/start { phone }` → `{ phone (masked), expiresInSeconds, resendAfterSeconds }`.

**States:**
- Field error from `fieldErrors.phone` shown under the field.
- 429 → "Too many codes asked for. Try again in a few minutes."
- The answer is the same whether or not the number has an account. **Never** say
  "welcome back" or "new number" here — that would let anyone test which numbers are
  registered.

---

## A4 · Enter the code

**Route** `app/(auth)/phone-code.tsx` · **Phase** 1

**Layout:** "We texted a code to …3210" · `CodeInput` (6 boxes) · "Resend in 0:42"
counting down from the server's `resendAfterSeconds` · "Change number".

**Behaviour:** SMS autofill (`autoComplete="sms-otp"`, `textContentType="oneTimeCode"`),
paste fills all boxes, submits by itself on the sixth digit.

**API:** `POST /api/auth/phone/verify { phone, code }` → `AuthResponse`. A number the
backend has never seen gets a new `CUSTOMER` account in the same step. Save the tokens,
load the profile, route as in A1.

**States:** wrong code → shake + "That code isn't right." · expired → "That code has
expired. Send a new one." · resend uses `POST /api/auth/phone/start` again.

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
  backend does not reveal which accounts exist, and neither do we.)

---

## A6 · Create an account with email

**Route** `app/(auth)/register.tsx` · **Phase** 1 · **Web reference** `HueVistaaPainter/src/app/register/register-form.tsx`

**Layout:** Name · Email · Password (rule shown under it: "At least eight characters, with a
letter and a number" — the backend's rule) ·
Mobile (optional) · **Create account** · "Already have an account? Sign in".

**API:** `POST /api/auth/register { name, email, password, phone? }` → `AuthResponse`.
Then A10 (the role choice).

**States:** 400 "Email already in use" → "That email already has an account." with a
**Sign in instead** button that carries the email across. Field errors under fields.

---

## A7 · Forgot password

**Route** `app/(auth)/forgot-password.tsx` · **Phase** 1 · **Web reference** `HueVistaaPainter/src/app/sign-in/forgot/forgot-flow.tsx`

**Two steps on one screen:**
1. "Send the code to" — Email / Mobile segmented. Then
   `POST /api/auth/forgot-password { email }` or `POST /api/auth/forgot-password/phone { phone }`.
   Always answer "If an account uses this, we've sent a code" — same words either way.
2. Code + new password → `POST /api/auth/reset-password { email, code, newPassword }`
   or `POST /api/auth/reset-password/phone`.

**After:** back to A5 with the email filled in and a toast "Password changed. Sign in
with the new one." (Resetting signs out every other device.)

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
for 30 days. Then S10 (with "Continue as customer" when the profile allows).

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
"Signing you in…" state while it exchanges the code.

**States:** the person closes the browser → back to A2, no error. An `error` in the
fragment or a 401 from the exchange → "Google sign-in didn't finish. Try again."

---

## A10 · About you (first run)

**Route** `app/(onboarding)/about-you.tsx` · **Phase** 1 · **Web reference** `HueVistaFrontEnd/src/components/app/welcome-tour.tsx`

**When:** the profile says `namePending` or `welcomePending` — a brand-new account.

**Layout:**
- "What should we call you?" — name field (empty when the account still wears the
  placeholder name).
- "How will you use HueVistaa?" — two large choice cards:
  - **I'm painting my home** — "Try shades on your own walls and take home a colour
    board."
  - **I paint for a living** — "Scan colour boards for points and get found by
    customers nearby."
- When the painter card is chosen, a note appears: "A painter account is for work.
  You can't use it to plan your own rooms — that needs a separate account."
- **Continue**.

**API:** `PATCH /api/auth/profile { name }` when the name changed. Painter →
`POST /api/painters/me`, then reload the profile and go to `/painter`, then
`POST /api/auth/welcome/seen`. Customer → A11.

**States:** `POST /api/painters/me` refused (the account already has rooms or a shop
code) → show the backend's reason and keep them as a customer.

---

## A11 · Quick tour (customers)

**Route** `app/(onboarding)/tour.tsx` · **Phase** 1

**Layout:** three swipeable cards with a real room picture each, dots, **Skip** top
right:
1. "Photograph a *room*." — the camera does the rest.
2. "Try any *shade*." — on your own walls, as many as you like, free.
3. "Leave with one *board*." — every shade code, ready for the counter.

Last card has two buttons: **I have a code from my shop** → C30, and **Start** →
`/home`.

**API:** `POST /api/auth/welcome/seen` on finish or skip. "Show me around" in S1
replays it.
