# 06 · Shared screens, deep links and system states

## Account screens both roles use (S1–S10)

These live in `app/(account)/` and need a signed-in session of any role.

### S1 · Settings

**Route** `(account)/settings.tsx` · **Phase** 2

- **Appearance:** "Follows your phone's light or dark setting" (no switch, like the
  website).
- **Show me around** (customers) → replays A11.
- **Language:** the phone's language (Hindi when the phone is in Hindi, else English),
  English, or हिन्दी — each language named in its own script. Kept on the phone. A new
  language reopens S1 in it (Phase 8).
- **Notifications** (Phase 8, where the phone can have them): On or Off. Off and still
  askable → asks; otherwise → the phone's settings.
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

**As built (S6, S7):** S6 opens with the message box, then the common answers (separate
sets for customers and painters), the past conversations, and Call or Email. A
conversation still open or waiting for the team is offered at the top. Other screens can
open S6 with the message already written: the payment result names the payment, and
tidying up names the walls. The assistant answers inside the request, so a start or a
message waits up to 130 s, with a typing bubble. One that gets no answer is looked for
before anything is said, every 5 s until it shows or can no longer land (140 s from the
send): a conversation that wasn't on the list before, with the same first message, or the
message in the conversation. The server writes the message and its answer in one
transaction, so a single look straight after a dropped connection would wrongly say it
never arrived. Meanwhile the screen says it's checking and Send waits. A message is never
sent twice, because each answer costs. S7 reads the
conversation every 5 s while it's on screen, and stops on Resolved, on a 404, and while
sending, and while another screen covers it. A new reply from the assistant or the team
is read out by a screen reader. Writing under a Resolved conversation starts a new one,
as the server's own note says. **Talk to a person** shows only while the assistant is
answering.

### S8 · Questions and answers

**Route** `(account)/questions.tsx` · **Phase** 7 · **Web reference** `app/community/questions/`

Answered questions from the community (`GET /api/community/questions`, paged) · **Ask a
question** (`POST /api/community/questions { body, displayName }`) · **My questions**
(`GET /api/community/questions/mine`).

**As built:** one scrolling list: **Ask a question** (inline, the name prefilled with
`suggestedName`, checked as the server checks it — 10–500 characters, a 2–60 character
name), then **Your questions** with where each stands (Waiting for an answer · Answered ·
Not published — a taken-down question's old answer is not shown), then the answered
questions, 20 at a time. An ask that gets no answer is looked for among the account's own
questions (a new one, not an earlier ask in the same words) before an error is shown. Painters reach S6 and S8 from their trade profile.

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
| Customer | The review flow (`GET /api/community/reviews/board/{token}`): review the job, or the plain `reason` when they can't, with "I'm the painter: open in the painter app" (`{painterOrigin}/r/{token}`) |
| Shop | "Shops collect their half on the website" + link |

**As built:** a link that isn't a board code says "That link doesn't carry one of our
codes." without asking the server. Signed out → **Sign in** replaces this screen with A2, and the
link is remembered even after a sign-out by choice, because it was asked for. Painter →
P6 (replaced, so Back doesn't land on this screen). Customer → the review screen shared
with C26. When the board isn't theirs to review, it may be their painter signed in as a
homeowner (App Links send every board's QR here), so D1 alone adds a link to the same board
in the painter web app (`EXPO_PUBLIC_PAINTER_ORIGIN`, as the website's `painterBoardUrl`).
The owner never sees it. Any other account → the website's page for the board.

### D2 · A shared room

**Route** `share/[token].tsx` · **Phase** 7 · **Web reference** `HueVistaFrontEnd/src/app/share/[token]/`

Public — no sign-in needed to look. `GET /api/share/{token}` (+ `/image`,
`/cleaned-image`, `/regions/{id}/mask`, `/brands`, `/shades`). The visitor can repaint
with the allowed companies; nothing is saved to the owner's room.

**Save as my room** → sign in if needed → `POST /api/share/{token}/claim` (uses one
room; 402 none left → C27; 409 it's your own room) → C11.

Expired or withdrawn → "This link has stopped working. Ask the person who sent it for a
new one."

**As built:** the photo is repainted on the phone with the link's own masks: wall chips,
**Colour for {wall}** (a sheet with the link's companies, one company read at a time,
searched by code or colour, 60 tiles at once), and a reset to the shared colours.
Only codes are shown, never names, as the link's scheme sets. Without GPU drawing the
photo shows unpainted.
- **Signed out:** **Sign in to save a copy** → A2, then back here. It is never saved by
  itself, because a copy spends a room.
- **A customer's own room:** **Open your room** → that room. Their own room answers
  `GET /api/projects/{id}`; anyone else's is a 404.
- **Another customer:** **Save as my room** → a confirm that it uses one room → claim →
  C11 on the new copy. The visitor's own repaint isn't copied: the server copies the
  owner's colours, each wall taking the nearest shade the new owner can use.
  - 402 → the server's sentence + **Rooms and credits**.
  - 404 → stopped working.
  - No answer → "Look in your rooms before trying again" + **Your rooms**. The claim has
    no key, so it is never sent again by itself.
- **Painters and shops** can look, but not save.
- A link that stopped (404) is told apart from a server that didn't answer (**Try
  again**).

**App Links (D1, D2):**
- `https://huevistaa.com/r/{code}` and `/share/{token}` open these screens. The intent
  filter in `app.json` uses `autoVerify` and covers those two paths only.
- `+native-intent` drops a campaign tag or a fragment. Links from other hosts, and other
  paths on the site, go on as they came.
- The website serves `/.well-known/assetlinks.json` from `ANDROID_APP_CERT_SHA256`, and
  answers 404 until that is set.
- iOS universal links wait for the Apple Team ID (see docs/08).

### D3 · Payment return

**Route** `pay/callback.tsx` · **Phase** 4

Normally the waiting browser session receives `huevista://pay/callback#…` and this
screen never shows. On a cold start (Android killed the app during payment) this route
reads the fragment, finds the pending order saved before checkout, verifies it, and
shows C29.

As built: when it opens while the app's own checkout is waiting, it hands the answer to
that checkout and steps aside. On Android the browser session can end (as "dismissed") a
moment BEFORE the redirect carrying the answer arrives, so the checkout waits briefly for
a late answer, and a success always wins — over an earlier cancel, failure or a browser
closed with no answer. A cancel or failure arriving just after the checkout settled is its
echo, and goes back. On a cold start it reads the fragment, finds the order kept on the
phone (`hv.pendingPayment`, the same account's only), and settles it: success → verify →
C29; cancelled → back to the basket; failed → C29 with the reason. A cancel or failure
never overwrites a payment that went through or a kept proof.

Signed out — or with the server unreachable — a success's proof is kept even when no
order was (sign-out clears unpaid orders but keeps paid proofs; one kept while signed out
goes to the next account to sign in, and the server, which checks the order is theirs,
decides). It then asks for sign-in (or offers Try again offline); C27 confirms it
afterwards. A cancel or failure only says to sign in. An unpaid order older than two hours
is forgotten; a paid proof is kept for a week — long past the server's own webhook.

---

## System states (X1–X6)

These are components and behaviours, not pages. Every screen uses them.

| ID | State | Behaviour |
|---|---|---|
| **X1** | Offline | Slim banner at the top: "You're offline. Showing what was saved." Cached data stays readable; actions that need the network say why they are disabled. Autosaves queue. |
| **X2** | Error | `ErrorState`: plain reason, **Try again**, **Get help** (→ S6). Server codes are mapped to sentences in `src/api/errors.ts`; a raw message or status code is never shown. |
| **X3** | Permission | Before the system prompt: a sheet with why (camera / photos / location). After a "don't ask again": **Open settings**. |
| **X4** | Session ended | Refresh token rejected → clear the session → A2 with "Please sign in again", then return to where they were. |
| **X5** | Update needed | Built (Phase 8): `UpdateNeeded` in place of every screen when the installed version is below the server's minimum for its store (`GET /api/mobile/version`), with **Update** to the store (or the store named, when there's no link). Decided from the last answer kept on the phone at start-up, and asked again on every return from the background, so it never waits on the network or blocks mid-use; fails open. A newer, not-required version shows **Update available** in S1. Small fixes ship over the air with EAS Update. |
| **X6** | Not found | `app/+not-found.tsx`: "That link doesn't open anything in the app." + **Go home**. |

**As built (Phase 8):**
- **X2:** a screen that throws while drawing shows "Something went wrong on this
  screen. Anything you saved is safe — try again." with **Try again** (the root
  `ErrorBoundary`), and the fault goes to the crash reports.
- **X3** for notifications: a sheet that says what will be told, before the phone's
  own question, at most once per reason, and only at a moment that waits:
  - walls being found (C8);
  - an AI image being made (C24);
  - a voucher just redeemed (P11);
  - a chat the team has taken (S7).
  
  Never at first launch or sign-in.

**Push notifications (Phase 8):**

| Sent when | Opens |
|---|---|
| Walls are ready, or couldn't be found | The room (CR, at its step) |
| An AI image is ready, or couldn't be made | C24 |
| A voucher is delivered, or declined (the points come back) | P11 |
| The team replies in a support chat | S7 |

- The text is generic: never a chat's words, a reason, or anything personal.
- Notifications come in the phone's chosen language.
- A tap opens the screen only for the account it was sent to.
- With the app open, a notification refreshes the screen it concerns. A reply to the
  chat on screen shows no banner, and S7 then reads the chat every 30 s rather than 5.
