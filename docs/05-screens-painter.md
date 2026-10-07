# 05 · The painter's app (P1–P12)

All routes are inside `app/painter/`, which only a `PAINTER` account can open. The
painter website (`VikramMali14/HueVistaaPainter`) already does every job here — each
screen names the file to copy behaviour from.

**Design for the painter's situation:** one hand, bright sun or a dim room, thirty
seconds. Bigger type than the customer side (body 18), high contrast, the Scan button
always one tap away, and very few words.

**Tabs:** Home · Points · **Scan** (a brass capsule filling the centre slot — a custom
tab button, because the navigator boxes icons at 24–31 px) · Rewards · Nearby. The
avatar in each tab's header opens P12 (trade profile) and S1 (settings).

---

### P1 · Home

**Route** `painter/(tabs)/index.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/home/dashboard.tsx`

**Layout:** "Namaste, Ramesh" · **points balance**, large, counting up when it changes ·
"120 points expire on 12 Mar" when a batch is close · big **Scan a board** button ·
last three claims (board, points, date) · a card for the next affordable reward ·
"Customers can find you: On/Off" → P5.

**API:** `GET /api/painter/points` · `GET /api/painter/rewards` · `GET /api/painters/me`.

**As built:** "Hello, Ravi" and the balance counting up (still for reduced motion). The
expiry line is "120 points expire in 3 days": warned inside the server's window
(`expiryWarningDays`), counted as the website counts it, and worded by the date in India
("today", "tomorrow"). The last three movements of any kind, in the server's own words.
The next reward is the cheapest one the balance covers, else the nearest. **Got the board
as a PDF?** → P7. When hidden from customers, a **Get found** card instead of the row.

### P2 · Points

**Route** `painter/(tabs)/points.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/wallet/wallet-screen.tsx`

**Layout:** balance · lifetime earned · **Batches** (each with the date it expires,
soonest first) · **Ledger** (every credit and spend, newest first) · link to **My
vouchers** (P10).

**API:** `GET /api/painter/points`.

**As built:** the ledger is the newest 20 movements, all the server gives the app, and says so
when there are 20. Each batch has a pill by its date (Today · Tomorrow · 12 days), warm
inside the warning window. Rewards on their way → P10. Where points come from, in the
website's words.

### P3 · Scan

**Route** `painter/(tabs)/scan.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/scan/scan-screen.tsx`, `components/app/qr-scanner.tsx`, `lib/reward-token.ts`

**Layout:** camera fills the screen with a `QrFrame` · torch button · two ways out at
the bottom: **Board came as a PDF?** (→ P7) and **Type the code** (→ P8).

**Behaviour:** `expo-camera` barcode scanning (QR only). Every read goes through the
ported `rewardTokenFrom()` — it accepts the board's URL from any host or a bare token,
and rejects other people's QR codes ("That isn't a HueVistaa board"). A good read
vibrates and goes to P6.

**States:** camera permission explained first; denied → P8 is still there.

**As built:** QR only. The camera runs only while the tab is showing (tabs stay mounted),
with a torch. Each text is handled once until the tab is come back to; somebody else's QR is
refused on the spot, without asking the server. Refused or no camera: why, and the other
two ways in.

### P4 · Rewards

**Route** `painter/(tabs)/rewards.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/rewards/rewards-screen.tsx`

**Layout:** balance on top · category chips (Tools · Site kit · Safety · Gear ·
Vouchers · Training) · cards: title, points cost, "You can get this" or "120 more
points", out of stock greyed → P9.

**API:** `GET /api/painter/rewards` (already priced against the balance).

**As built:** the catalogue has no pictures, so each reward has its kind's icon. Priced by
the server (`affordable`, `pointsShort`), the status in the website's order: out of stock,
points to go, not this account, only N left, ready. Chips by kind; out of stock dimmed. No
confirmed mobile → a banner to S4.

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

**As built:** the location is read once, when asked (`expo-location`, balanced accuracy),
and rounded to 2 places (about a kilometre) before it's sent; the server keeps no more. A
fix rougher than 2 km is warned about. **Remove** clears it on Save and turns the listing
off. The switch waits for a location and a confirmed mobile (each shown, the mobile → S4).
`about` is always sent: the server overwrites it when it's missing.

### P6 · Claim a board

**Route** `painter/claim/[token].tsx` · **Phase** 6 · **Web reference** `components/app/claim-panel.tsx`, `app/(app)/(painter)/scan/[token]/page.tsx`

**First, a preview** (`GET /api/rewards/{token}`): "This board is worth **50 points**
to you." · **Claim 50 points**.

**Claim:** `POST /api/rewards/{token}/claim` → a full-screen success: points counting
up, the new balance, **Scan another** / **Done**. Haptic on success.

**States** (from the scan's `claimable` / `reason`): already claimed by a painter ·
already claimed by you · expired · not a board that pays painters — each in one plain
sentence with **Scan another**.

**As built:** the server says what a board pays — 25 points today, not 50. A claim has no
request key, so an unanswered one is never repeated: the points and the board are read
again, and it counts as landed only when the board no longer reads claimable and a board
credit for that much has appeared since the ask. Otherwise "this board hasn't paid you —
try again". A refusal reads the board again and shows how it stands, in the server's
words. Claimed: **+25** counting up, a tap of the hand, **Scan another board** · **See
what that buys** · **Done**.

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

**As built:** a PDF, or a photo of its last page, up to 25 MB, read in a hidden WebView (a
sandboxed iframe on the web) with pdf.js and jsQR and the network shut off — see
[07](07-architecture.md#the-painter-phase-6). Pages are read last first, then the first,
then backwards, as the website does; "Page 4 of 4" while reading, and **Stop reading**.
Proved in Chromium on a real board. **Open with HueVistaa** works for PDFs (Android and
iOS) and goes straight to reading, through sign-in if needed. **Share to HueVistaa**
(Android's share sheet) needs a native share-intent module — left for later.

### P8 · Type the code

**Route** `painter/type-code.tsx` · **Phase** 6

For a board too creased or too dark to scan. One field (accepts the code or the whole
link), paste-friendly, **Check code** → P6. Same validation as P3.

**As built:** as specified; a pasted link with spaces around it is fine.

### P9 · Reward detail

**Route** `painter/reward/[code].tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/rewards/redeem-sheet.tsx`

**Layout:** picture/icon, title, what it is, points cost, stock.

**Redeem** → `ConfirmSheet`: "We'll call **98765 43210** to arrange delivery. Points
can't be returned once you redeem — only our team can cancel a voucher." →
`POST /api/painter/rewards/redeem { itemCode, requestKey }` → P11. Make a new
`requestKey` (a random id) for each press of Redeem and **reuse it on a retry**: the
backend then returns the same redemption instead of spending the points twice — this
matters on a phone that loses signal mid-tap.

**States:** no verified mobile → "Add your mobile first — we call it to deliver" → S4 ·
not enough points → button disabled with "120 more points" · out of stock.

**As built:** no picture (the catalogue has none), the kind's icon. **Redeem** needs it in
stock, affordable, a painter account (`canRedeem`) and a confirmed mobile; otherwise the
button says why. One request key per press, kept across retries and renewed once a
redemption comes back. The stock line shows only for limited stock. After a redemption →
P11 marked **Redeemed**.

### P10 · My vouchers

**Route** `painter/vouchers.tsx` · **Phase** 6

Redemptions newest first with status: **Waiting for delivery** · **Delivered** ·
**Cancelled** (with the reason and "points returned"). **API:** `GET /api/painter/redemptions`.

**As built:** on their way first, each with its code; then settled. A refund (the server's
`REJECTED`) gives the team's reason and says the points went back.

### P11 · Voucher

**Route** `painter/voucher/[id].tsx` · **Phase** 6

The voucher code **drawn large enough to read at arm's length**, the item, the date,
the status, and what happens next ("Our team will call you to deliver this").

**As built:** read from the list (the server has no single read). The code drawn large;
long press copies it. What happens next: who will call, on which number; delivered on;
or refunded and why.

### P12 · Trade profile

**Route** `painter/profile.tsx` · **Phase** 6 · **Web reference** `app/(app)/(painter)/profile/profile-screen.tsx`

What customers see about the painter's trade: **service areas** (chips, add/remove),
**specialties** (chips), **years of experience**, **day rate (₹)**, **mobile** (the
verified one is what customers get). Rating and jobs done shown read-only. Links to
S1 settings.

**API:** `GET /api/painters/me` · `PUT /api/painters/me { serviceAreas, specialties, yearsExperience, dayRateInr, phone … }`
(send the `…Sent` flags exactly as the website does, so an empty field clears and a
missing one is left alone).

**As built:** areas (up to 20, 80 characters each) and specialties (up to 12, 40 each)
added one at a time, tidied and never twice, with suggestions. Years and day rate (₹) are
whole numbers; emptied, they're cleared. Rating and jobs finished are read-only. The
mobile is never sent from here (only S4 changes it). A painter account with no painter
profile behind it gets **Set it up**. Rows to name (S2), mobile (S4), listing (P5) and
settings (S1).

