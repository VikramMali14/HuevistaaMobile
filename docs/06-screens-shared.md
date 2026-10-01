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
- **App version** and build number (tap 7 times → copy diagnostics for support).
- **Sign out** (confirm) · **Delete account** → S9.

### S2 · Your name

**Route** `(account)/edit-name.tsx` · **Phase** 2

One field and **Save**. `PATCH /api/auth/profile { name }`.

### S3 · Email

**Route** `(account)/verify-email.tsx` · **Phase** 2 · **Web reference** `components/app/account-verification.tsx`

Add or confirm an email: `POST /api/auth/verify/email/send { email? }` → 6-digit code →
`POST /api/auth/verify/email/confirm { code }`. Hidden on a shop's customer profile
(`linkedProfile`), which has no sign-in of its own.

### S4 · Mobile number

**Route** `(account)/mobile-number.tsx` · **Phase** 2 · **Web reference** `components/app/phone-move.tsx`

- **Add / confirm:** `POST /api/auth/verify/phone/send { phoneNumber? }` →
  `POST /api/auth/verify/phone/confirm { code }`.
- **Change number:** `POST /api/auth/verify/phone/move/send { phoneNumber }` →
  `POST /api/auth/verify/phone/move/confirm { code }`.
- Say plainly that this number signs the account in.

### S5 · Password

**Route** `(account)/password.tsx` · **Phase** 2

- `hasPassword` true → current + new → `POST /api/auth/change-password`. This signs out
  every device, this one included → back to A5 with a toast.
- `hasPassword` false (mobile or Google accounts) → "Set a password" (new only) →
  `POST /api/auth/set-password`.

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
images, credits (customers); points, vouchers not yet delivered, the nearby listing
(painters). A tick box "I understand this can't be undone" enables **Delete my
account** (`danger`) → `DELETE /api/auth/account` → clear the session → A2.

### S10 · Web-only accounts

**Route** `(account)/web-only.tsx` · **Phase** 1

For `RETAILER`, `DISTRIBUTOR` and `ADMIN`:
- "Shop tools live on the website" + **Open HueVistaa for shops** (browser).
- `switchTo = "CUSTOMER"` (a shop with its customer profile on) → **Continue as
  customer** → `POST /api/auth/profiles/switch { deviceToken, refreshToken }` → new
  session → `/home`. If the answer is `emailCodeRequired` → A8.
- **Sign out**.

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
