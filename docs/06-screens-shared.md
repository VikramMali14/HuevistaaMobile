# 06 · Shared screens, deep links and system states

## Account screens both roles use (S1–S10)

These live in `app/(account)/` and need a signed-in session of any role.

### S1 · Settings

**Route** `(account)/settings.tsx` · **Phase** 2

- **Appearance:** "Follows your phone's light or dark setting" (no switch, like the
  website).
- **Show me around** (customers) → replays A11.
- **Language:** English. (Hindi in Phase 8 — every string is already in `src/i18n`.)
- **Legal:** Terms · Privacy · Refunds · About · Contact — the website's `/legal/…`
  pages in the in-app browser, so they are always current.
- **App version** and build number (tap 7 times → copy diagnostics for support: version,
  build, platform, account id and role — never a token).
- **Sign out** (confirm) · **Delete account** → S9 — not on a shop's customer profile,
  which is turned off from the shop (the website's account page leaves it out too).

### S2 · Your name

**Route** `(account)/edit-name.tsx` · **Phase** 2

One field and **Save**. `PATCH /api/auth/profile { name }` — two to 80 characters
(the backend's minimum is two). Unchanged → just goes back (to Account when there is
nothing behind it). Saved → toast "Name saved." An account still wearing its stand-in
name opens with the field empty.

### S3 · Email

**Route** `(account)/verify-email.tsx` · **Phase** 2 · **Web reference** `components/app/account-verification.tsx`

Add or confirm an email: `POST /api/auth/verify/email/send { email? }` → 6-digit code →
`POST /api/auth/verify/email/confirm { code }`. A confirmed email shows **Change email**;
an unconfirmed one **Send code** or **Use a different email**; none goes straight to
the field. Nothing changes on the account until the code comes back. Resend waits the
server's `cooldownSeconds`; a resend that is refused ("Too many codes…") is said in a
banner under the buttons, not under the code boxes — it is not the code that was wrong. A shop's customer profile (`linkedProfile`) sees a note
instead — its sign-in is the shop's. (S3 and S4 share `src/features/account/VerifyFlow.tsx`.)

### S4 · Mobile number

**Route** `(account)/mobile-number.tsx` · **Phase** 2 · **Web reference** `components/app/phone-move.tsx`

- **Add / confirm / change:** `POST /api/auth/verify/phone/send { phoneNumber? }` →
  `POST /api/auth/verify/phone/confirm { code }`. Changing the number is the same call
  with the new number; it moves onto the account only when the code comes back.
- `…/verify/phone/move/*` is **not** for customers: it is how a shop proves a number
  that signs a separate customer account in and moves that account into the shop's
  customer profile (the website's `phone-move.tsx`).
- Say plainly that this number signs the account in.

### S5 · Password

**Route** `(account)/password.tsx` · **Phase** 2

- `hasPassword` true → current + new → `POST /api/auth/change-password`. This signs out
  every device, this one included → A5 with the email filled in and a toast. The app
  does not call logout again (the server already ended the session) and lands there
  through `signOut({ serverAlreadyKnows, landing })`, so nothing is remembered for the
  next sign-in. A wrong current password is said under that field; an empty one says
  "Enter your current password."
- `hasPassword` false, mobile or walk-in accounts → "Set a password" (new only) →
  `POST /api/auth/set-password`. It signs in beside the email, so it needs a confirmed
  email first ("Add or confirm an email" → S3). Same sign-out and landing as a change.
- Google accounts have no HueVistaa password: an explanation, no form (the backend
  refuses both calls). A shop's customer profile sees the linked-profile note.

### S6 · Help and support

**Route** `(account)/help/index.tsx` · **Phase** 7 · **Web reference** the website's support bubble

Past conversations (`GET /api/support/conversations`) with status (Open · Waiting for
our team · Resolved) · **Ask for help** → a message box → `POST /api/support/conversations { message }`
→ S7. Common answers above the list (how rooms work, boards, payments).

### S7 · Support conversation

**Route** `(account)/help/[conversationId].tsx` · **Phase** 7

Chat bubbles (You · HueVistaa assistant · Our team). Composer at the bottom.
`POST /api/support/conversations/{id}/messages { body }`. **Talk to a person** →
`POST …/request-human`. While open, refresh every 5 s (until push arrives in Phase 8).

### S8 · Questions and answers

**Route** `(account)/questions.tsx` · **Phase** 7 · **Web reference** `app/community/questions/`

Answered questions from the community (`GET /api/community/questions`, paged) · **Ask a
question** (`POST /api/community/questions { body, displayName }`) · **My questions**
(`GET /api/community/questions/mine`).

### S9 · Delete account

**Route** `(account)/delete-account.tsx` · **Phase** 2 · **Web reference** `components/app/delete-account-button.tsx`

Google Play requires in-app account deletion. List exactly what goes: rooms, boards, AI
images, rooms and credits not used — not refunded (the backend's delete ends any plan
and refunds nothing) (customers); points, vouchers not yet delivered, the nearby listing
(painters). A tick box "I understand this can't be undone" enables **Delete my
account** (`danger`) → `DELETE /api/auth/account` → clear the session (no logout call
— the account is gone) → A2 with "Your account has been deleted." A shop customer is
also told the rooms the shop gave can't be given back. A refusal (e.g. an account that
owns a shop) is the backend's own sentence. A shop's customer profile gets a note
instead of the form: it is turned off from the shop, which keeps its rooms.

### S10 · Web-only accounts

**Route** `(account)/web-only.tsx` · **Phase** 1

For `RETAILER`, `DISTRIBUTOR` and `ADMIN` — anyone else who reaches the address is sent
to their own home, and it is never remembered across sign-in (A1):
- "Shop tools live on the website" + **Open HueVistaa for shops** → `/dashboard`
  (browser). A distributor reads "Distributor tools…", an admin "Admin tools…" with
  **Open the website** → `/admin`; a signed-out browser is sent on to the shops' site to
  sign in.
- `switchTo = "CUSTOMER"` (a shop with its customer profile on) → **Continue as
  customer** → `POST /api/auth/profiles/switch { deviceToken, refreshToken }` → new
  session → `/home` (or A10 on the profile's first run). This direction never asks for
  the emailed code: the shop session already passed every check
  (`CustomerProfileService.switchProfile`).
- **Sign out** → A2. Nothing is remembered for the next sign-in (A1).

**Phase 2 note — switching back:** the customer profile → shop switch (from the Account
tab) *can* answer `emailCodeRequired`. A8 lives in `app/(auth)/`, whose layout sends a
signed-in session away, so that switch must take the code on its own screen inside
`(account)/` (sharing A8's code form), not by opening A8.

---

## Links from outside the app (D1–D3)

### D1 · A board's QR

**Route** `r/[token].tsx` · **Phase** 7 · **Web reference** `HueVistaFrontEnd/src/app/r/[token]/page.tsx`

Opened by `https://huevistaa.com/r/{token}` (once App Links are set up) or from P3.

| Who | What happens |
|---|---|
| Signed out | "Sign in to collect points or review the job" → A2, then back here |
| Painter | → P6 |
| Customer | The review flow (`GET /api/community/reviews/board/{token}`): review the job, or the plain `reason` when they can't |
| Shop | "Shops collect their half on the website" + link |

### D2 · A shared room

**Route** `share/[token].tsx` · **Phase** 7 · **Web reference** `HueVistaFrontEnd/src/app/share/[token]/`

Public — no sign-in needed to look. `GET /api/share/{token}` (+ `/image`,
`/cleaned-image`, `/regions/{id}/mask`, `/brands`, `/shades`). The visitor can repaint
with the allowed companies; nothing is saved to the owner's room.

**Save as my room** → sign in if needed → `POST /api/share/{token}/claim` (uses one
room; 402 none left → C27; 409 it's your own room) → C11.

Expired or withdrawn → "This link has stopped working. Ask the person who sent it for a
new one."

### D3 · Payment return

**Route** `pay/callback.tsx` · **Phase** 4

Normally the waiting browser session receives `huevista://pay/callback#…` and this
screen never shows. On a cold start (Android killed the app during payment) this route
reads the fragment, finds the pending order saved before checkout, verifies it, and
shows C29.

As built: when it opens while the app's own checkout is waiting (Android can deliver the
link both ways), it steps aside — one verification per payment is shared. On a cold start
it reads the fragment, finds the order kept on the phone (`hv.pendingPayment`, the same
account's only), and settles it: success → verify → C29; cancelled → back to the basket;
failed → C29 with the reason. Signed out, it keeps the proof and asks for sign-in; C27
confirms it afterwards. An unpaid order older than two hours is forgotten; a paid one is
kept until the server confirms it.

---

## System states (X1–X6)

These are components and behaviours, not pages. Every screen uses them.

| ID | State | Behaviour |
|---|---|---|
| **X1** | Offline | Slim banner at the top: "You're offline. Showing what was saved." Cached data stays readable; actions that need the network say why they are disabled. Autosaves queue. |
| **X2** | Error | `ErrorState`: plain reason, **Try again**, **Get help** (→ S6). Server codes are mapped to sentences in `src/api/errors.ts`; a raw message or status code is never shown. |
| **X3** | Permission | Before the system prompt: a sheet with why (camera / photos / location). After a "don't ask again": **Open settings**. |
| **X4** | Session ended | Refresh token rejected → clear the session → A2 with "Please sign in again", then return to where they were. |
| **X5** | Update needed | Phase 8: a minimum-version check (needs a small backend endpoint). Small fixes ship over the air with EAS Update. |
| **X6** | Not found | `app/+not-found.tsx`: "That link doesn't open anything in the app." + **Go home**. |
