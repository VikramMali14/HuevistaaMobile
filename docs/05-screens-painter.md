# 05 · The painter's app (P1–P12)

All routes are inside `app/painter/`, which only a `PAINTER` account can open. The
painter website (`VikramMali14/HueVistaaPainter`) already does every job here — each
screen names the file to copy behaviour from.

**Design for the painter's situation:** one hand, bright sun or a dim room, thirty
seconds. Bigger type than the customer side (body 18), high contrast, the Scan button
always one tap away, and very few words.

**Tabs:** Home · Points · **Scan** (raised, centre, brass) · Rewards · Nearby. The
avatar in each tab's header opens P12 (trade profile) and S1 (settings).

---

### P1 · Home

**Route** `painter/(tabs)/index.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/home/dashboard.tsx`

**Layout:** "Namaste, Ramesh" · **points balance**, large, counting up when it changes ·
"120 points expire on 12 Mar" when a batch is close · big **Scan a board** button ·
last three claims (board, points, date) · a card for the next affordable reward ·
"Customers can find you: On/Off" → P5.

**API:** `GET /api/painter/points` · `GET /api/painter/rewards` · `GET /api/painters/me`.

### P2 · Points

**Route** `painter/(tabs)/points.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/wallet/wallet-screen.tsx`

**Layout:** balance · lifetime earned · **Batches** (each with the date it expires,
soonest first) · **Ledger** (every credit and spend, newest first) · link to **My
vouchers** (P10).

**API:** `GET /api/painter/points`.

### P3 · Scan

**Route** `painter/(tabs)/scan.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/scan/scan-screen.tsx`, `components/app/qr-scanner.tsx`, `lib/reward-token.ts`

**Layout:** camera fills the screen with a `QrFrame` · torch button · two ways out at
the bottom: **Board came as a PDF?** (→ P7) and **Type the code** (→ P8).

**Behaviour:** `expo-camera` barcode scanning (QR only). Every read goes through the
ported `rewardTokenFrom()` — it accepts the board's URL from any host or a bare token,
and rejects other people's QR codes ("That isn't a HueVistaa board"). A good read
vibrates and goes to P6.

**States:** camera permission explained first; denied → P8 is still there.

### P4 · Rewards

**Route** `painter/(tabs)/rewards.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/rewards/rewards-screen.tsx`

**Layout:** balance on top · category chips (Tools · Site kit · Safety · Gear ·
Vouchers · Training) · cards: title, points cost, "You can get this" or "120 more
points", out of stock greyed → P9.

**API:** `GET /api/painter/rewards` (already priced against the balance).

### P5 · Nearby — be found by customers

**Route** `painter/(tabs)/nearby.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/listing/listing-screen.tsx`

**Layout:**
- **Show me to customers nearby** switch (off until turned on).
- **Where you're based** — "Use my location" (kept to about a kilometre) or clear it.
- **A line about you** (e.g. "Interior and exterior, 12 years, Pune").
- **Preview** — exactly the row a customer sees in C32.

**API:** `PUT /api/painters/me/listing { listedForCustomers, about, latitude, longitude, clearLocation }`.
The website coarsens the position — keep that rule on the phone too
(`PainterService.coarsen`, two decimal places).

### P6 · Claim a board

**Route** `painter/claim/[token].tsx` · **Phase** 6 · **Web reference** `components/app/claim-panel.tsx`, `app/(app)/(painter)/scan/[token]/page.tsx`

**First, a preview** (`GET /api/rewards/{token}`): "This board is worth **50 points**
to you." · **Claim 50 points**.

**Claim:** `POST /api/rewards/{token}/claim` → a full-screen success: points counting
up, the new balance, **Scan another** / **Done**. Haptic on success.

**States** (from the scan's `claimable` / `reason`): already claimed by a painter ·
already claimed by you · expired · not a board that pays painters — each in one plain
sentence with **Scan another**.

### P7 · Board came as a PDF

**Route** `painter/upload-board.tsx` · **Phase** 6 · **Web reference** `lib/board-file.ts`

**Why:** boards are often forwarded on WhatsApp as a PDF; you cannot point a camera at
it on the same phone.

**Flow:** pick the file (`expo-document-picker`) → read it **on the phone** → find the
QR on the last page first (the QR is always on the last page) → P6. The PDF never
leaves the phone; only the token goes to the server.

**Technical note:** pdf.js needs a canvas. Run the website's `board-file.ts` logic in a
hidden WebView with pdf.js + jsQR bundled offline (no network), and pass the token
back. Also register the app for "Open with / Share to HueVistaa" on PDFs so a painter
can send the board straight from WhatsApp.

**States:** no QR found → "We couldn't find a board code in this file. Try scanning the
printed board or typing the code."

### P8 · Type the code

**Route** `painter/type-code.tsx` · **Phase** 6

For a board too creased or too dark to scan. One field (accepts the code or the whole
link), paste-friendly, **Check code** → P6. Same validation as P3.

### P9 · Reward detail

**Route** `painter/reward/[code].tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/rewards/redeem-sheet.tsx`

**Layout:** picture/icon, title, what it is, points cost, stock.

**Redeem** → `ConfirmSheet`: "We'll call **98765 43210** to arrange delivery. Points
can't be returned once you redeem — only our team can cancel a voucher." →
`POST /api/painter/rewards/redeem` → P11.

**States:** no verified mobile → "Add your mobile first — we call it to deliver" → S4 ·
not enough points → button disabled with "120 more points" · out of stock.

### P10 · My vouchers

**Route** `painter/vouchers.tsx` · **Phase** 6

Redemptions newest first with status: **Waiting for delivery** · **Delivered** ·
**Cancelled** (with the reason and "points returned"). **API:** `GET /api/painter/redemptions`.

### P11 · Voucher

**Route** `painter/voucher/[id].tsx` · **Phase** 6

The voucher code **drawn large enough to read at arm's length**, the item, the date,
the status, and what happens next ("Our team will call you to deliver this").

### P12 · Trade profile

**Route** `painter/profile.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/profile/profile-screen.tsx`

What customers see about the painter's trade: **service areas** (chips, add/remove),
**specialties** (chips), **years of experience**, **day rate (₹)**, **mobile** (the
verified one is what customers get). Rating and jobs done shown read-only. Links to
S1 settings.

**API:** `GET /api/painters/me` · `PUT /api/painters/me { serviceAreas, specialties, yearsExperience, dayRateInr, phone … }`
(send the `…Sent` flags exactly as the website does, so an empty field clears and a
missing one is left alone).
