# 04 · The homeowner's app (C1–C33)

All routes are inside `app/(customer)/`, which only a `CUSTOMER` account can open.
Spec format is explained at the top of [03-screens-auth.md](03-screens-auth.md).

**The rooms balance.** Several screens show "rooms left". It is worked out exactly as
the website does (`HueVistaFrontEnd/src/hooks/use-account-balance.ts`):

```
rooms left  = max(0, entitlement.projectsRemaining)      GET /api/me/entitlement (null = no shop)
            + max(0, purchaseOptions.availableCredits)   GET /api/billing/points/project-options
AI credits  = wallet.eligible ? wallet.balance : hidden  GET /api/billing/ai-credits
```

All three failing is a **network state**, not a balance of zero — show nothing rather
than "0 rooms". This lives in one hook, `useBalance()`, used everywhere.

**The three "next step" states** (from `components/app/customer-next-step.tsx`):

| State | Meaning | The one button |
|---|---|---|
| `ready` | At least one room to spend | **Start a new room** → C6 |
| `exhausted` | A shop is behind this account and its rooms are used up | **Ask your shop for another room** → C27 (shop customers are never sold a room) |
| `missing` | No shop, nothing bought | **Buy a room — ₹…** → C28, with "I have a shop code" → C30 beside it |

---

## Tabs

### C1 · Home

**Route** `(tabs)/home.tsx` · **Phase** 2 · **Web reference** `app/(app)/dashboard/page.tsx`, `components/app/customer-next-step.tsx`, `dashboard-projects.tsx`

**Layout (top to bottom):**
1. Greeting by time of day — "Good evening, Priya" — and the avatar (→ Account). An
   account still wearing its stand-in name (`namePending`, a mobile sign-up) is greeted
   without one — "Good evening" — never "Good evening, User".
2. Two `BalanceChip`s: "3 rooms left", "12 AI credits" (→ C27).
3. **Next-step card** — one sentence of what they hold and the one button for their
   state (table above).
4. **Rooms in progress** — horizontal strip: photo, name, status chip, days left. Tap
   resumes at the right step. "See all" → Studio tab.
5. **Latest AI image** (if any) — large card → C24.
6. **Find a painter or a shop near you** → C32.
7. **Ready-made rooms** strip (only when the library has rooms) → C21. "No photo? Paint
   one of ours."

**States:** first visit with nothing → the next-step card fills the screen with a
room picture above it (the words and buttons stay on the card's surface, so every
button reads in both themes); loading → skeleton chips and cards; the balance
unreadable → no chips and no card (never "0 rooms"); rooms unreadable → "Your rooms
didn't load" + Try again; pull to refresh (the spinner turns only for a pull, not
when the data reloads by itself).

The rooms strip shows rooms not finished and not past their time, newest activity
first; a room opens at `/room/{id}` (CR picks the step). Shop customers in the
`exhausted` state are never offered a purchase.

**API:** balance hook · `GET /api/projects` · `GET /api/me/renders` (first item) ·
`GET /api/free-projects`.

### C2 · Studio — my rooms

**Route** `(tabs)/studio.tsx` · **Phase** 3 · **Web reference** `components/app/projects-grid.tsx`, `room-status.tsx`

**Layout:** title "Your rooms" · segmented **In progress / Finished** · list of room
cards · **New room** button pinned at the bottom.

**Room card:** photo, name, what it is (Bedroom…), and one status chip:

| Chip | When |
|---|---|
| Working… | `status = SEGMENTING` |
| Mark your walls | `CREATED`, or `SEGMENTED` with no walls (`regionCount = 0`) |
| Ready to paint | `SEGMENTED` with walls |
| Didn't work | `FAILED` |
| Finished | `closedAt` set |
| View only | `readOnly` |

`GET /api/projects` sends no `boardsUsed`, `readOnlyReason` or `MANUAL` status, so the
chip is worked out from what it does send (`src/features/rooms/room-status.ts`, used
on Home since Phase 2). "Board taken" vs "Closed" needs the room itself (Phase 3).

Plus "12 days left" from `accessExpiresAt` (in `warmText` under 3 days).

**Actions:** tap → `room/[id]` (opens the right step). Long-press menu: Rename
(`PATCH /api/projects/{id}`), Share (C17), Delete (`ConfirmSheet`: "Deleting a room is
permanent and does not give the room back to your balance." → `DELETE /api/projects/{id}`).

**States:** empty → "No rooms yet" + **Start a room** and **Try a ready-made room** ·
New room with no balance → the `exhausted`/`missing` card instead of the camera.

**API:** `GET /api/projects`.

### C3 · Catalogue

**Route** `(tabs)/catalogue.tsx` · **Phase** 2 · **Web reference** `app/catalogue/page.tsx`, `components/atelier/shade-grid.tsx`, `lib/colour-search.ts`, `lib/colour-families.ts`

**Layout:** search ("Name or code — e.g. Ivory Mist, L124") · brand tabs · family chips
(Whites · Neutrals · Greys & blacks · Reds & pinks · Oranges & browns · Yellows &
golds · Greens · Blues · Purples · Other) · tone chips (Light · Medium · Dark) · grid
of `SwatchTile`s, three across, grouped by brand · the shade disclaimer at the end ·
a "Ready-made rooms" row at the top when the library has rooms.

**Data:** `GET /api/shades/mine/brands` for the tabs, `GET /api/shades/mine` for the
shades (already limited to what this account may see — a shop customer gets only
their shop's companies). Cache it on the phone and filter on the device: the list
changes rarely and filtering locally works offline and instantly.

**Codes and names:** `GET /api/me/shade-code-scheme` says how to show codes. For
everyone but an administrator the backend sends the HV code ("HV0348") and no shade
name, so tiles print the HV code; a name appears only when the scheme says
`showNames: true` and the shade carries one. The backend always sends the flag, so a
scheme that is still loading or failed to load means **no names** — a shop that hides
names never has them flash up (the website's studio reads it the same way). Search matches only what is on screen (the HV code, a shown
name, the hex) plus colour words. Ported unchanged from the website:
`color`, `color-science`, `colour-search`, `colour-families`, `shade-codes`,
`shade-codec` (with their tests), and `shade-mapping` with the company slug added.

**The copy on the phone:** the catalogue is kept in AsyncStorage in the website's
compact format (~50 bytes a shade), tagged with the account id — another account's copy
is never shown (a shop customer sees only their shop's companies) — and cleared on
sign-out. The copy shows at once; the live list replaces it. A new search or filter
scrolls back to the top.

**States:** no match → "No shade called 'xyz'. Try a code like L124 or a colour like
'ivory'." · loading → grey tile skeletons · offline with cache → works fully.

**Performance:** thousands of tiles — use `FlashList`, fixed tile size, memoised tiles.

### C4 · Boards

**Route** `(tabs)/boards.tsx` · **Phase** 4 · **Web reference** `components/app/ai-images.tsx`, `ai-images-strip.tsx`

**Layout:** segmented **Colour boards / AI images**.
- **Colour boards:** rooms with `boardsUsed > 0`, newest first: photo, name, date,
  "3 options" → C25.
- **AI images:** grid of finished images (`GET /api/me/renders`) → C24. **Make an AI
  image** button → C22.

**States:** each half has its own empty state that explains what it will hold and how
to get one ("Take a colour board from any room and it appears here").

### C5 · Account

**Route** `(tabs)/account.tsx` · **Phase** 2 · **Web reference** `app/(app)/account/`, `components/app/account-details.tsx`

**Layout (grouped list):**
- Header card: avatar, name, mobile and email with "verified" marks → S2. With no name
  given yet (`namePending`) it reads "Add your name" and the Name row "No name yet".
- **Your balance** → C27 (the rooms and credits under the title, so neither wraps).
- **Shop:** "Add a shop code" → C30. Shop customers also see **My products** → C31.
- **Painters and shops near you** → C32.
- **Help:** Help & support → S6 · Questions & answers → S8.
- **Sign-in details:** Name → S2 · Email → S3 · Mobile → S4 · Password → S5.
- **More:** Work as a painter → C33 — shown only once the account is known to have no
  shop code and no rooms (the backend refuses otherwise) · Settings → S1.
- **Sign out** (`ConfirmSheet`) · app version in `caption`.
- A shop's customer profile (`switchTo = "SHOP"`) gets **Switch back to your shop**,
  which explains that shop tools are on the website (S10). Its sign-in details are the
  shop's to change, so they are replaced by a note. Going back into the shop can ask for
  the shop's emailed code; A8 lives in the signed-out screens, so the code is taken in a
  sheet here (`SwitchToShop`), then the guard moves on to S10. A sign-in that brings a
  different profile (this switch, or S10's "Continue as customer") drops everything the
  last profile left on the phone — the screens' data, the catalogue copy and the cached
  pictures — so one profile's rooms never show under the other's name. If the new
  profile cannot be read, the switch ends signed out rather than on the old profile.
- A Google account's Password row reads "Google sign-in".

---

## The studio — one room, five steps

Every studio screen shows `StepDots`: **Add photo · Tidy up · Detect walls · Adjust ·
Apply colour**. Only the current step is labelled; a working step spins.

`room/[projectId]/index.tsx` sends the person to the right step from the room's state:

| Room state | Opens |
|---|---|
| `CREATED` | C8 (choose clean-up options and start) |
| `SEGMENTING` | C8 (working state) |
| `FAILED` | C8 (failed state) |
| `SEGMENTED`, no walls (manual mode) | C10 |
| `SEGMENTED` with walls, never painted | C9 |
| `SEGMENTED` and painted before | C11 |
| closed | C25 |

`room/[projectId]/_layout.tsx` loads the room once (`GET /api/projects/{id}`) and
shares it with every step through the query cache.

### C6 · Add photo (step 1)

**Route** `room/new.tsx` · **Phase** 3 · **Web reference** `components/atelier/photo-confirm-panel.tsx`, `lib/image-upload.ts`

**First, the balance.** With no room to spend, this screen shows the `exhausted` or
`missing` card instead of the camera.

**Layout:** full-screen camera viewfinder · big shutter in the bottom centre ·
gallery button (left) · flash (top) · "Try a sample room" (right, → C20) · one hint
line: "Whole wall in frame · lights on · step back a little".

**After the shutter:** full-screen preview with **Retake** / **Use this photo**.

**Upload:** shrink on the phone first (long edge 2048 px, JPEG quality 0.85 with
`expo-image-manipulator`) — faster on 4G and always under the 10 MB limit — then
`POST /api/images/upload` (multipart, field `file`) with a progress bar. Move to C7
**immediately**; the upload finishes while they name the room.

**States:**
- Camera permission: explain first ("To photograph your room"), then ask. Denied →
  "Camera is off for HueVistaa. You can still pick a photo from your gallery." +
  **Open settings**.
- 422 not a room → "This doesn't look like a room or a house. Try a photo of the
  walls you want to paint." + Retake.
- Upload failed → keep the photo, **Try again**.

### C7 · Name it (still step 1)

**Route** `room/details.tsx` · **Phase** 3 · **Web reference** `components/atelier/project-details-gate.tsx`

**Layout:** upload progress across the top · photo thumbnail · **Name** (filled in
from the type and date, like the website's `defaultProjectName`) · "What are you
painting?" chips: Living room · Bedroom · Kitchen · Bathroom · Office · Hallway ·
Exterior · Other · a plain line: "This uses 1 of your 3 rooms." · **Create** (enabled
once the upload is done).

**API:** `POST /api/projects { imageId, name, roomType }` → C8.

### C8 · Tidy up (steps 2 and 3, working)

**Route** `room/[projectId]/tidy.tsx` · **Phase** 3 · **Web reference** `components/atelier/visualizer.tsx` (pipeline), `lib/segmentation-polling.ts`, `components/atelier/studio-gate-panel.tsx`

**Before starting — three plain choices:**
- **Furniture:** Keep as it is / Empty the room → `cleanFurnishing: KEEP | EMPTY`
- **Camera angle:** As I took it / Best view → `cleanAngle: AS_SHOT | BEST_VIEW`. Under
  Best view: "The walls will match the new view, not your photo."
- **Walls:** Find them for me / I'll mark them myself → `maskMode: AUTO | MANUAL`

**Start:** `POST /api/projects/{id}/segment { maskMode, cleanFurnishing, cleanAngle }`.
402 `AUTO_MASK_UNAVAILABLE` → "Automatic wall finding isn't available on this room.
You can mark the walls yourself — it's free." and switch to MANUAL.

**Working state** (`WorkingState`): poll `GET /api/projects/{id}/status` every 2 s,
easing to 5 s after a minute; stop while the app is in the background, poll at once
on return.

| What the server says | What the person sees |
|---|---|
| `SEGMENTING`, no `cleanedImageUrl` | "Clearing the clutter" — the photo dimmed, "about 20 seconds" |
| `SEGMENTING`, `cleanedImageUrl` present | The cleaned photo fades in, "Finding your walls" |
| `aiProgressNote` | Shown as the sentence under the stage |
| `SEGMENTED` | → C9 (or C10 in manual mode) |
| `FAILED` | `failureReason` in plain words + **Try again** / **Mark walls myself** / **Get help** |
| `autoMaskFailed` | `autoMaskNotice` + → C10 to mark walls by hand |

Elapsed time is always shown. **Leave this running** returns to the Studio tab; the job
carries on on the server and the room card says "Working…".

### C9 · Walls found (step 3)

**Route** `room/[projectId]/walls.tsx` · **Phase** 3 · **Web reference** `components/atelier/visualizer-parts.tsx`, `lib/wall-plan.ts`

**Layout:** the cleaned photo with each wall tinted and labelled (Walls · Ceiling · Trim
· Doors, plus any drawn by hand) · "Your walls today: Ivory" (from
`detectedWallColour`) · a list of the walls, each with **Paint this** on/off ·
**Start painting** → C11 · **Fix a wall** → C10 · "The walls are wrong" → C18.

**API:** the plan toggles save with `PUT /api/projects/{id}/regions/plan`.

**States:** a report on this room (`GET /api/projects/{id}/mask-reports/latest`) shows
a banner: "We're redrawing these walls — usually within a day" or "Fixed: …".

### C10 · Adjust walls (step 4)

**Route** `room/[projectId]/adjust.tsx` · **Phase** 3 · **Web reference** `components/atelier/mask-studio.tsx`, `lib/mask-grow.ts`, `lib/mask-feather.ts`, `lib/mask-autofit.ts`

**Layout:** the photo full screen (tab bar hidden) · pinch to zoom, two fingers to
pan · tool bar: **Brush** (add) · **Eraser** (remove) · **Shape** (tap corners for a
straight-edged wall) · brush size · **Undo / Redo** · bottom chip row of walls (colour
dot + name) and **+ New wall** (pick: Main wall · Accent wall · Trim · Ceiling ·
Other) · **Done**.

**API:** change an existing wall's mask → `PUT /api/projects/{id}/regions/{regionId}/mask { maskBase64 }`.
New wall → `POST /api/projects/{id}/regions/custom-mask { maskBase64, label, category }`.
Delete a hand-drawn wall → `DELETE /api/projects/{id}/regions/{regionId}` (AI walls
cannot be deleted, only reshaped).

**UX notes:** a magnifier above the finger while drawing; edges snap and soften like
the website's feathering; "Done" saves and goes to C11. Masks must be at the cleaned
image's resolution.

### C11 · Paint (step 5) — the most important screen

**Route** `room/[projectId]/paint.tsx` · **Phase** 3 · **Web reference** `components/atelier/visualizer.tsx`, `lib/webgl-recolor.ts`, `lib/canvas-light.ts`, `lib/recolor-engine.ts`

**Layout:**
- The room fills the screen (tab bar hidden). Light and shadow stay real — this is the
  ported WebGL engine on `expo-gl`.
- Tap a wall on the photo to select it (hit-test the masks). The selected wall gets a
  thin outline.
- **Wall strip** just above the dock: chips with each wall's current colour + name.
- **Dock:** horizontal row of recently used and suggested swatches · **Browse shades**
  (→ C12) · **Suggestions** (→ C13).
- Top bar: back, room name, **Compare** (→ C14), **Undo**, and the board tray button
  with a count badge (→ C15).
- **Press and hold** anywhere on the photo to see the original underneath.
- **Save this combination** — adds the current colours to the board tray (stored on
  the phone until the board is made; the website keeps the tray client-side too).

**Autosave:** each colour change → `PUT /api/projects/{id}/regions [{ regionId, shadeCode, hexCode }]`,
debounced 600 ms, queued while offline and sent on reconnect.

**States:**
- `readOnly` → banner with `readOnlyReason`; painting disabled, viewing allowed.
- Access ending → banner "3 days left on this room".
- GL not available (very old phone) → "Your phone can't show live colour. You can
  still pick shades and take a board." (Check the engine's fallback in the spike.)
- The shade disclaimer is one tap away (ⓘ) and printed on the board.

**Performance target:** colour change visible in < 100 ms, 60 fps pan/zoom on a
mid-range Android (e.g. 4 GB RAM).

### C12 · Shade picker

**Route** `shade-picker.tsx` (modal sheet) · **Phase** 3 · **Web reference** `components/atelier/shade-grid.tsx`, `company-picker.tsx`

**Opens at half height** so the room stays visible above it; drag up to 85% to browse.
Same search, brand tabs, family and tone chips as C3. A **Recent** row on top; for
shop customers a **Your shop's picks** row (`GET /api/me/retailer-combos`). Tapping a
swatch paints the selected wall straight away; the sheet stays open to try another.
**Done** closes it.

**Params:** `projectId`, `regionId`.

### C13 · Suggested palettes

**Route** `room/[projectId]/suggestions.tsx` (sheet) · **Phase** 3 · **Web reference** `components/atelier/coordinate-suggestions.tsx`, `lib/harmony.ts`

Three named palettes, each a run of swatches mapped to the walls and one sentence on
why. **Try this** paints the room with it (autosaves). **Suggest again** asks for a new
set. Free and instant.

**API:** `POST /api/projects/{id}/recommendations?round={n}`. 402 → the room's access
has closed.

### C14 · Before and after

**Route** `room/[projectId]/compare.tsx` · **Phase** 3

Full screen. A draggable divider between the original photo and the painted room.
**Share this view** saves a JPEG of the split and opens sharing (WhatsApp first).

### C15 · Colour board — choose and confirm

**Route** `room/[projectId]/board.tsx` · **Phase** 4 · **Web reference** `components/atelier/colour-board-tray.tsx`, `board-download-confirm.tsx`, `lib/colour-board-download.ts`, `lib/pdf-export.ts`, `lib/pdf-core.ts`

**Layout:** the saved combinations, each a thumbnail with its shades per wall · remove
or reorder · "Add one more" (back to C11).

**The confirm step** (`ConfirmSheet`), stated plainly before the press:
- "Your board will have **3 options** on **4 pages**."
- "This is this room's only board (`boardsUsed` of `boardsAllowed`)."
- "Taking it **closes the room**. You can still look at it, but not change colours."

**Make my colour board** runs, in this order (the order is the money rule):
1. `GET /api/projects/{id}/reward-code` — the QR for the last page (204 = no QR).
2. **Build the PDF on the phone** — port `pdf-core.ts` / `pdf-export.ts` (plain
   TypeScript); page images come from GL snapshots of each combination.
3. `POST /api/projects/{id}/colour-boards { pages }` — charges and records it.
   - A refusal (402, 409) **stops** the hand-over and says why.
   - Silence (no network, timeout) **fails open**: hand the board over anyway — a
     customer at a counter must not lose it to a bad signal.
4. Save the file → C16.

### C16 · Board ready

**Route** `room/[projectId]/board-done.tsx` · **Phase** 4

**Layout:** page previews · **Send on WhatsApp** (primary) · **Save to phone** ·
**Share…** · next steps: **Make an AI image of this room** (→ C23), **Find a painter
near you** (→ C32), **Back to my rooms** · the shade disclaimer.

### C17 · Share this room

**Route** `room/[projectId]/share.tsx` (sheet) · **Phase** 4 · **Web reference** `components/atelier/share-dialog.tsx`

"Anyone with this link can see the room and try shades on it." · how long: 1–10 days
(default 10) · which companies they may use (all, or pick) · **Share on WhatsApp** ·
**Copy link** · **More…** · when a link exists: its expiry and **Stop sharing**
(confirm).

**API:** `POST /api/projects/{id}/share?days=10&brands=asian-paints,berger` — days and
brands are **query parameters**, not a JSON body (`brands` is a comma-separated list;
leave it out for every company). Creates the link, or refreshes the same one, up to 10
days. `DELETE /api/projects/{id}/share` withdraws it.

### C18 · The walls are wrong

**Route** `room/[projectId]/report.tsx` (sheet) · **Phase** 3 · **Web reference** `components/atelier/report-dialog.tsx`

Tick what went wrong (one or more), mapped to the backend's issue codes:
**The walls are in the wrong place or missing** (`MASK_NOT_GENERATED_PROPERLY`) · **The
clean-up spoiled my photo** (`IMAGE_NOT_CLEANED_PROPERLY`) · **Something else**
(`OTHER`) — and an optional note. **Send** → "Thanks. We'll redraw the walls, usually
within a day." Reporting again updates the open report.

**API:** `POST /api/projects/{id}/mask-reports { issues: [...], note? }` ·
`GET /api/projects/{id}/mask-reports/latest` (204 when the room was never reported).
Status `NEW`/`IN_REVIEW` → "being redrawn"; `FIXED` → "fixed, here is what changed";
`RESOLVED` → closed without a redraw.

---

## Shades and ready-made rooms

### C19 · Shade detail

**Route** `shade/[brand]/[code].tsx` · **Phase** 2

**Layout:** the colour fills the top third · name (only when shown) · **code**
(`ShadeCode`, large, long-press to copy) · company — **only when the scheme says
`showBrands: true`, which it never does for a customer** (and not while the scheme is
loading or failed): company + name + code together identify a shade, so the company
goes with the other two · family (the parent family and the company's own, once) ·
depth and light reflectance · finishes · good for (rooms) · the backend's description ·
**Try it on a room** (a sheet of the rooms **ready to paint** — walls marked, not
closed — → `/room/{id}/paint?shade=&brand=`; none ready → C6 with the same params) ·
**Find a shop near you** (→ C32 `?tab=shops`) · the shade disclaimer. The status bar
takes dark or light text to read on the colour behind it, and goes back to the app's
own when the screen is left.

**API:** the catalogue copy is the list of what this account may see. A shade not in it
is "We couldn't find this shade" + **Open the catalogue** — the public
`GET /api/shades/{brandSlug}/{hvCode}` stands in for the shade only when the catalogue
could not be loaded at all, and otherwise just adds the description and rooms. While
the live catalogue is still replacing an older copy, a missing shade waits for it. The
company slug in a link is read in lower case.

### C20 · Ready-made rooms

**Route** `library/index.tsx` · **Phase** 2 · **Web reference** `components/app/library-rooms.tsx`

Grid of rooms the HueVistaa team published; Indoor / Outdoor filter. Hidden everywhere
when the library is empty. **API:** `GET /api/free-projects`.

### C21 · Ready-made room

**Route** `library/[slug].tsx` · **Phase** 2

Photo (a tall one is cropped to half the screen, so the name starts above the buttons),
name, a line about it, **Paint this room**. Free — it does not use one of your rooms
(the backend spends no quota, credit or points). The walls come already marked, so it
opens straight on C11.

Every start makes a **new** copy (the backend never reuses one). So when this account
already has an unfinished copy — `fromLibrary`, still open, and still carrying the
room's title — the screen says "You're already painting this room." with **Open your
copy** (→ `/room/{id}`) first and **Start a fresh copy** under it.

**API:** the listing first, else `GET /api/free-projects/{slug}` (asked for only once the
listing has answered without it) · `POST
/api/free-projects/{slug}/start` → project id → `/room/{id}/paint` (the room list is
refreshed). A room that has gone (404) → "This room isn't available any more" + **See
the other rooms**. The colours it was painted in are listed with the shade disclaimer.

---

## AI images

### C22 · AI image — choose the room

**Route** `ai-image/new.tsx` · **Phase** 5 · **Web reference** `components/atelier/render-project-picker.tsx`

Finished rooms that have board combinations (`GET /api/me/renderable-projects`), then
the combination to photograph (`GET /api/projects/{id}/combos`). Empty → "Take a colour
board from a room first — the AI image is made from one of its options."

### C23 · AI image — options

**Route** `ai-image/options.tsx` · **Phase** 5 · **Web reference** `components/atelier/render-studio.tsx`

Plain choices, each with a small picture:
**Style** (Modern · Minimal · Traditional · Heritage · Luxe) · **Lighting** (Natural ·
Warm · Cool · Dramatic) · **Time** (Day · Night) · **Furnishing** (Keep · Staged ·
Empty) · **Border** (Keep original · AI suggested) · **Quality** (from the wallet's
`renderTiers`) · an optional note.

Above the button: "This uses **2 AI credits**. You have 12." Short → **Buy credits**
(→ C28). **Make the image** → `POST /api/projects/{id}/renders { comboId, …options }` → C24.

### C24 · AI image — working and result

**Route** `ai-image/[renderId].tsx` · **Phase** 5

**Working:** `WorkingState` while `QUEUED` / `RUNNING` (poll
`GET /api/projects/{id}/renders/{renderId}`). "Leave this running" — it appears in
Boards when ready.

**Result:** the image full bleed, pinch to zoom · **Save to phone** · **Send on
WhatsApp** · **Share…** · the AI disclaimer. `FAILED` → plain reason; credits are not
lost (say so only if the server confirms a refund).

---

## Boards, reviews, money

### C25 · Board detail

**Route** `board/[projectId].tsx` · **Phase** 4

The room photo, the date the board was taken, every option on it (`GET /api/projects/{id}/combos`)
with shade codes large, **Make an AI image** (→ C23), and **Review the job** (→ C26)
once the work is done.

### C26 · Review the job

**Route** `review/[projectId].tsx` · **Phase** 7 · **Web reference** `app/r/[token]/board-review-panel.tsx`

Stars (1–5), a few words, the name to show (prefilled with `suggestedName`). Shows the
shop's name. Already reviewed → shows it, editable while `canEdit`.

**API:** `GET /api/community/reviews/project/{projectId}` (the board code for this
room) → `GET/POST /api/community/reviews/board/{token}`.

### C27 · Rooms and credits

**Route** `balance.tsx` · **Phase** 4 · **Web reference** `components/app/projects-and-credits.tsx`, `ai-credit-wallet.tsx`, `buy-room.tsx`

**Layout:** two big counters — **rooms left** (with how long a room stays open) and
**AI credits** — then:
- Shop customer, rooms used up → **Ask your shop for another room**
  (`POST /api/me/request-more-projects` → "We've asked Sharma Paints").
- Self-serve → **Buy rooms** (→ C28).
- **Buy AI credits** (→ C28), with the price per credit from the wallet.
- **Add a shop code** (→ C30).
- AI credit statement (from the wallet response).

### C28 · Checkout

**Route** `checkout.tsx` · **Phase** 4 · **Web reference** `components/app/credits-cart.tsx`, `lib/payments.ts`

A short basket: rooms, AI credits, the room + credits bundle — prices from
`GET /api/billing/cart` (in paise; show ₹ exactly). Optional discount code. The total
on the button, from the order response: **Pay ₹{amount}**.

**Pay:** `POST /api/billing/cart/order` (or `/api/billing/ai-credits/order` for credits
alone) → open `https://huevistaa.com/pay/mobile?order=…&key=…&amount=…&desc=…` in the
auth browser session → result arrives on `huevista://pay/callback#status=…` → verify
(`POST /api/billing/cart/verify` or `/ai-credits/verify`) → C29. Report checkout events
with `POST /api/billing/attempts/{reference}/events`. Full flow in
[07-architecture.md](07-architecture.md#payments).

### C29 · Payment result

**Route** `payment-result.tsx` · **Phase** 4

| Outcome | Screen |
|---|---|
| Verified | "Paid. 2 rooms added." + new balance + **Start a room** |
| Cancelled | Back to the basket, nothing said beyond "Payment cancelled." |
| Failed | Razorpay's reason in plain words + **Try again** |
| Paid but verify failed / no network | "We're checking your payment" — retry the verify; never say "failed" after a success |

### C30 · Add a shop code

**Route** `add-shop-code.tsx` · **Phase** 2 · **Web reference** `app/unlock/unlock-form.tsx`

`ShopCodeInput` (8 character boxes — letters and numbers, uppercased, paste-friendly) ·
"Your shop gave you this at the counter." · **Add code** → `POST /api/access-codes/redeem { code }` → "Added.
Sharma Paints gave you 3 rooms." The rooms and boards already on the account stay.

**States:** wrong code · expired code · already used · code for another kind of account
— each in plain words from the server's message; an unknown code (404) gets the app's
own sentence ("We don't know that code. Check it with your shop — it's 8 letters and
numbers."). A pasted WhatsApp message gives up its code (`shopCodeFromText`). Adding a
code refreshes the balance, rooms, AI images, catalogue, scheme and products; only the
balance and rooms are waited for (the next button spends a room), the rest reloads
behind the done screen — the catalogue alone can take many seconds. Done →
"Added. Sharma Paints gave you 2 rooms." + **Start a room** / **Go home**.

### C31 · My products

**Route** `my-products.tsx` · **Phase** 2 · **Web reference** `components/app/assigned-products.tsx`

Every shop behind the account, each with its address, hours and **Call** button, and
what it unlocked: the **companies** it picked (chips) and its **product lines** grouped
by company, with the shop's own price. A shop that picked nothing out still shows, with
"This shop hasn't narrowed anything down for you — you get the full range it carries."
(nothing picked means everything, not nothing — the website says the same). No shop at
all → "No shop yet" + **Add a shop code**. **API:** `GET /api/me/assigned-products`.
Shown only to shop customers.

### C32 · Painters and shops near you

**Route** `nearby.tsx` · **Phase** 7 · **Web reference** `components/app/nearby-finder.tsx`, `lib/geolocation.ts`, `lib/nearby.ts`

**Layout:** segmented **Painters / Shops** · distance chips (2 · 5 · 10 · 25 · 50 km) ·
list, nearest first.
- **Painter row:** name, a line about them, specialties, years, rating (★ 4.6 · 23),
  jobs done, "3.2 km away" (a distance — never a position). **Call** reveals the number
  (`GET /api/nearby/painters/{id}/phone`) and opens the dialler.
- **Shop row:** name, address, hours, distance · **Call** · **Directions** (opens Maps).

**Location:** ask with a reason first ("To find painters and shops near you"). Denied →
"Type your area" is not supported by the backend yet, so say "Turn on location to
search near you" + **Open settings**.

**API:** `GET /api/nearby/painters?lat&lon&radiusKm` · `GET /api/nearby/shops?lat&lon&radiusKm`.

### C33 · Work as a painter

**Route** `become-painter.tsx` · **Phase** 6

Explains what a painter account does, and plainly: "This changes this account into a
painter's account for good. A painter account can't plan its own rooms." **Make this a
painter account** → `POST /api/painters/me` → reload profile → `/painter`.

Refused (rooms or a shop code on the account) → the backend's reason: "Sign up
separately to work as a painter."
