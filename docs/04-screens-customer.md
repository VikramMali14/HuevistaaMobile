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
on Home since Phase 2). "Board taken" vs "Closed" needs the room itself, so the list
says Finished for both.

Plus "12 days left" from `accessExpiresAt` (in `warmText` under 3 days).

**Actions:** tap → `room/[id]` (opens the right step). Long-press menu: Rename
(`PATCH /api/projects/{id}`), Share (C17), Delete (`ConfirmSheet`: "Deleting a room is
permanent and does not give the room back to your balance." → `DELETE /api/projects/{id}`).
Screen readers hear a hint and get the menu as an action on the card. A deleted room's
unsaved colours, kept combinations and any board made on this phone go with it.

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

As built: the colour boards are `GET /api/me/renderable-projects` — rooms carrying board
combinations, finished first (a reopened room keeps its combinations and shows "Still
open"). The room list sends no board count, so `boardsUsed > 0` can't be read from it. The
server lists finished AI images only, so the images this phone is following while they are
made (asked for here, opened on C24, or seen on C23) come first as "Being made…" — Leave
this running never lands on a shelf without the image. Failed ones are left out. A read
again that fails keeps both lists on screen. Opened with `?tab=ai` (Leave this running on
C24, All my AI images), it opens on the AI images, once.

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

A view-only room that is not closed opens on C11 to look at. "Painted
before" is remembered on the phone (a room painted on the website opens on C9 the first
time here). Every step reads the room with `useRoom()` — one cache entry for
`GET /api/projects/{id}`, which C8's poll keeps current. A shade passed from C19 rides
along to C11 and paints the first wall.

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

The gallery is always offered beside the camera, before permission is asked too. The
shutter waits for the camera to be ready; "Try a sample room" shows only when there are
ready-made rooms; Android's back from the preview returns to the camera. The upload
lives in `photo-upload.ts`, outside both screens, so it carries on while C7 is filled in;
**Retake** on C7 drops it and starts over. Once the room is made, C6 and C7 leave the
stack: back from C8 goes to wherever the room was started from.

### C7 · Name it (still step 1)

**Route** `room/details.tsx` · **Phase** 3 · **Web reference** `components/atelier/project-details-gate.tsx`

**Layout:** upload progress across the top · photo thumbnail · **Name** (filled in
from the type and date, like the website's `defaultProjectName`) · "What are you
painting?" chips: Living room · Bedroom · Kitchen · Bathroom · Office · Hallway ·
Exterior · Other · a plain line: "This uses 1 of your 3 rooms." · **Create** (enabled
once the upload is done).

**API:** `POST /api/projects { imageId, name, roomType }` → C8. The "uses 1 of your 3
rooms" line is left out while the balance is unknown — never "0 rooms". If the room
can't be made, the reason shows above **Create** and the uploaded photo is kept.

**As built:** Create has no request key, so a second send is a second room
(`features/studio/create-room.ts`). An unanswered Create (no connection, a timeout, a
5xx) reads the rooms list and goes on into the room made from this photo, if it's there.
Pressed again, Create reads the list first and is sent only when the list shows no room
from the photo; while the list can't be read, nothing is sent.

### C8 · Tidy up (steps 2 and 3, working)

**Route** `room/[projectId]/tidy.tsx` · **Phase** 3 · **Web reference** `components/atelier/visualizer.tsx` (pipeline), `lib/segmentation-polling.ts`, `components/atelier/studio-gate-panel.tsx`

**Before starting — three plain choices:**
- **Furniture:** Keep as it is / Empty the room → `cleanFurnishing: KEEP | EMPTY`
- **Camera angle:** As I took it / Best view → `cleanAngle: AS_SHOT | BEST_VIEW`. Under
  Best view: "The walls will match the new view, not your photo."
- **Walls:** Find them for me / I'll mark them myself → `maskMode: AUTO | MANUAL`

**Start:** `POST /api/projects/{id}/segment { maskMode, cleanFurnishing, cleanAngle }`.
402 `AUTO_MASK_UNAVAILABLE` → "Automatic wall finding isn't available on this room.
You can mark the walls yourself — it's free." and switch to MANUAL. Only that code does:
any other 402 is the room itself (closed, or nothing to bill) and is shown as the backend
words it — marking by hand would be refused the same way.

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
carries on on the server and the room card says "Working…". After 8 minutes (the
website's deadline, the backend's worst case) it stops promising: "This is taking much
longer than it should", with **Start again** and **Tell us** (→ C18); the poll carries on
in case it lands. **Start again** re-sends the room's own choices: the backend takes it
once the run has gone quiet for 5 minutes (a 409 "already in progress" before then just
goes back to watching), and a room that has had all its runs (429
`SEGMENTATION_RUN_LIMIT`) gets the server's sentence and no further Start again.

### C9 · Walls found (step 3)

**Route** `room/[projectId]/walls.tsx` · **Phase** 3 · **Web reference** `components/atelier/visualizer-parts.tsx`, `lib/wall-plan.ts`

**Layout:** the cleaned photo with each wall tinted and labelled (Walls · Ceiling · Trim
· Doors, plus any drawn by hand) · "Your walls today: Ivory" (from
`detectedWallColour`) · a list of the walls, each with **Paint this** on/off ·
**Start painting** → C11 · **Fix a wall** → C10 · "The walls are wrong" → C18.

**API:** the plan toggles save with `PUT /api/projects/{id}/regions/plan`.

**States:** a report on this room (`GET /api/projects/{id}/mask-reports/latest`) shows
a banner: "We're redrawing these walls — usually within a day" or "Fixed: …".

A wall switched off keeps its shape and colour; it is just not one of the surfaces
being painted (the website's `wall-plan.ts`). With every wall switched off, **Start
painting** waits for one. Tapping a wall on the photo or in the list makes it stand out
(the others fade back). A refused switch is put back on that wall alone.

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

**As built:** one finger draws, two pinch and pan (`ZoomView`, centred on the fingers,
never off the screen). Each wall's edits are kept as a list and replayed on the GPU, so
Undo/Redo are instant and each wall keeps its own; the walls show as see-through tints,
the one being edited stronger. Shape shows its corners, and the fill they make, as they
are tapped; Done applies corners laid out and not yet filled (as the website does). Done
saves only the walls that changed, as 8-bit PNGs made on the phone (07, "Editing masks");
a wall left with nothing marked is refused by name rather than saved empty. Leaving with
unsaved edits asks first — the back button, the swipe and Android's back alike.
**Not yet:** the magnifier, and edge snapping (`mask-autofit.ts`) — the soft edge comes
from the engine's own one-pixel antialiasing.

### C11 · Paint (step 5) — the most important screen

**Route** `room/[projectId]/paint.tsx` · **Phase** 3 · **Web reference** `components/atelier/visualizer.tsx`, `lib/webgl-recolor.ts`, `lib/canvas-light.ts`, `lib/recolor-engine.ts`

**Layout:**
- The room fills the screen (tab bar hidden). Light and shadow stay real — this is the
  ported WebGL engine on `expo-gl`.
- Tap a wall on the photo to select it (hit-test the masks). The selected wall gets a
  thin outline: a light line on its edge with a soft dark halo, drawn by the engine in the
  same frame as the paint (not in snapshots, nor while holding for the "before").
- **Wall strip** just above the dock: chips with each wall's current colour + name. A
  saved colour shows as its shade (the catalogue shade found again); the backend's
  opening colours show as the nearest real shade, as on the website (07, "The studio's
  state").
- **Dock:** horizontal row of recently used and suggested swatches · **Browse shades**
  (→ C12) · **Suggestions** (→ C13). As built: the palette is always on screen under the
  room, so the photo is never covered while colours are tried: family chips, then two
  rows of swatches scrolling sideways (recent first, then suggested ones: the colours of C13's first
  palettes, mains first, none repeated from Recent; then the catalogue); a tap paints
  the selected wall. Under it, on one line: **More shades** (→ C12, for search),
  **Suggestions**, **Save** (this combination) and the ⓘ. The dock is the same height
  whatever it holds, so the room above keeps its size (a resize starts the GPU over).
- Top bar: back, room name, **Compare** (→ C14), **Undo**, and the board tray button
  with a count badge (→ C15).
- **Press and hold** anywhere on the photo to see the original underneath.
- **Save this combination** — adds the current colours to the board tray (stored on
  the phone until the board is made; the website keeps the tray client-side too).

**Autosave:** each colour change → `PUT /api/projects/{id}/regions [{ regionId, shadeCode, hexCode }]`,
debounced 600 ms, queued while offline and sent on reconnect. A failed save keeps the
changes, says "Your colours aren't saved yet — we'll keep trying.", and retries in 10 s
(over the photo, so the canvas keeps its size); a refusal for good (the room closed or
went) stops, puts the walls back as saved and says why; a refetch never
undoes a change still waiting to be saved (07, "The studio's state").

**States:**
- `readOnly` → banner with `readOnlyReason`; painting disabled, viewing allowed.
- Access ending → banner "3 days left on this room".
- GL not available (very old phone) → "Your phone can't show live colour. You can
  still pick shades and take a board." The rest of the screen keeps working.
- The shade disclaimer is one tap away (ⓘ) and printed on the board.

**Performance target:** colour change visible in < 100 ms, 60 fps pan/zoom on a
mid-range Android (e.g. 4 GB RAM). Measured with the live-colour check (Settings → press
and hold the version) — still to be run on a real phone.

### C12 · Shade picker

**Route** `shade-picker.tsx` (modal sheet) · **Phase** 3 · **Web reference** `components/atelier/shade-grid.tsx`, `company-picker.tsx`

**Opens at half height** so the room stays visible above it; drag up to 85% to browse.
Same search, brand tabs, family and tone chips as C3. A **Recent** row on top; for
shop customers a **Your shop's picks** row (`GET /api/me/retailer-combos`). Tapping a
swatch paints the selected wall straight away; the sheet stays open to try another.
**Done** closes it.

**Params:** `projectId`, `regionId`.

As built: a route (`formSheet`, half and 85% height) rather than an in-screen sheet, so
the back button and gestures behave; it writes to the same paint store as C11, so the
room above changes as each swatch is tapped. The catalogue is grouped by company rather
than tabbed.

### C13 · Suggested palettes

**Route** `room/[projectId]/suggestions.tsx` (sheet) · **Phase** 3 · **Web reference** `components/atelier/coordinate-suggestions.tsx`, `lib/harmony.ts`

Three named palettes, each a run of swatches mapped to the walls and one sentence on
why. **Try this** paints the room with it (autosaves). **Suggest again** asks for a new
set. Free and instant.

**API:** `POST /api/projects/{id}/recommendations?round={n}`. 402 → the room's access
has closed.

As built: a modal route sharing C11's paint store. Each palette shows which wall each
colour will go on (main, accent, trim from the paint plan — the website's
`shade-grid.tsx`); a colour with no wall to go on is shown faded.

### C14 · Before and after

**Route** `room/[projectId]/compare.tsx` · **Phase** 3

Full screen. A draggable divider between the original photo and the painted room.
**Share this view** saves a JPEG of the split and opens sharing (WhatsApp first).

The engine draws the split itself (the walls are painted only right of the line), so the
shared JPEG is a snapshot of exactly what is on screen (`expo-sharing`). With nothing
painted it says both sides look the same.

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

As built (`features/boards`): the saved combinations print in the paint plan's order,
each wall named, with its HV code (names only where the scheme shows them). One canvas
above the list shows the option tapped, and photographs each option in turn when the
board is made (`RoomCanvas.snapshot(only)`) — a GL view per thumbnail would hit the phone's
cap on GL contexts. An option whose picture can't be taken (no WebGL) prints as its
swatches, never dropped: the server records every page. A board carries
`imagesPerPdf` options (`GET /api/billing/pdf-allowance`, five); more than that asks for
some to come off. The board is written into a folder of its own BEFORE the charge, kept
(and the room's earlier board deleted) only once handed over, and thrown away when
refused — a refused board never costs the last good one. Closed, view-only and spent rooms
say why instead of offering the button; a closed one points to C25.

After the Phase 4 audit: **Make** waits until every wall's shape has loaded (`RoomCanvas`
reports `loading`), so no picture leaves a painted wall out; a wall that couldn't load, a
photo that didn't, or a phone with no live colour is said in the confirm (unpainted walls,
or swatch pages) rather than discovered on paper. The confirm never promises a page total
before the reward code is fetched: "{n} options, one page each", plus a line for the
reward page on a customer's own room. Options are numbered as they will print — one whose
walls have all left the plan is "Won't be printed" — and a screen reader hears each
option's walls and codes. Taking one off offers **Undo** (the tray is the only copy). An
option naming more than 16 walls (the server's page limit) is flagged and blocks Make.
Back is held while the board is made, and the working state stays up until C16 is shown.
A room name the board's fonts can't print (not Latin letters) is printed as "Your room".

### C16 · Board ready

**Route** `room/[projectId]/board-done.tsx` · **Phase** 4

**Layout:** page previews · **Send on WhatsApp** (primary) · **Save to phone** ·
**Share…** · next steps: **Make an AI image of this room** (→ C23), **Find a painter
near you** (→ C32), **Back to my rooms** · the shade disclaimer.

As built: **Send the board** (primary) opens the phone's share sheet, where WhatsApp is —
without native code a file reaches WhatsApp only through it, so there is no separate
WhatsApp or Share… button. **Save to phone** writes a copy into a folder the person picks
on Android (a PDF is not a photo, so not the gallery); elsewhere it is the share sheet's
Save to Files. The pages are the snapshots (a swatch page shows its colours, the reward
page an icon). The AI-image step opens C22 with the room, which picks the option. Opened
with no board on this phone (made elsewhere) → "This board isn't on this phone" + the
room's options (C25).

After the audit: files are kept as their place inside the app's documents (iOS moves the
documents' own path on an update; older full paths are read from `boards/` on). A board
handed over on a charge that went unanswered says it wasn't saved to the room, and its
options stay on C15 to make it again (the tray is only emptied once the server has
recorded the board). If the reward page couldn't be fetched, a line says so. On iOS,
Save to phone is the share sheet, which never says how it was closed, so no "saved" toast
follows it. "1 option on 1 page" reads as such.

### C17 · Share this room

**Route** `room/[projectId]/share.tsx` (sheet) · **Phase** 4 · **Web reference** `components/atelier/share-dialog.tsx`

"Anyone with this link can see the room and try shades on it." · how long: 1–10 days
(default 10) · which companies they may use (all, or pick) · **Share on WhatsApp** ·
**Copy link** · **More…** · when a link exists: its expiry and **Stop sharing**
(confirm).

**API:** `POST /api/projects/{id}/share?days=10&brands=Asian Paints,Berger` — days and
brands are **query parameters**, not a JSON body (`brands` is a comma-separated list of
company **names**; leave it out for every company). Creates the link, or refreshes the
same one. `DELETE /api/projects/{id}/share` withdraws it.

As built: 3, 7 or 10 days — the backend makes any other number 10 — and the companies
from `GET /api/shades/mine/brands`, by name (the picker hides with one company). The
room's own `shareToken` / `shareExpiresAt` show a live link when the sheet opens; the
link is `{SITE}/share/{token}`. WhatsApp opens `wa.me` with the message, Copy link uses the
clipboard, More… the phone's share sheet. A room with no live link shows the choices and
**Make the link** first; the ways to send it appear once there is a link. The owner's
room doesn't say which companies its link allows, so **Change** starts from the defaults,
says that updating sets both again, and has **Cancel**. Studio's long-press menu offers
Share only for rooms the server will share (not a lapsed view-only room).

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

As built: the list is every room with a board page, in the server's order: finished rooms
first, then rooms still open ("Finished 1 Oct 2026" / "Still open"; `closedAt` can be null
whatever the backend's comments say). Each shows the cleaned photo where there is one,
since that is what gets painted. Opened with `projectId` (from C16, or Change option on
C23), it goes straight to that room's options. A room with one option goes on to C23 with
`replace`, so back doesn't land on a one-item list. Options are grouped by board, in printed
order, with their swatches and codes, so two options that share a name can still be told
apart. An option with a finished image says "AI image made"; a failed one doesn't. A room
no longer on the account says so, never "Project not found". A list that won't load is
an error with Retry, never "no rooms". The shade disclaimer sits under the options.

### C23 · AI image — options

**Route** `ai-image/options.tsx` · **Phase** 5 · **Web reference** `components/atelier/render-studio.tsx`

Plain choices, each with a small picture:
**Style** (Modern · Minimal · Traditional · Heritage · Luxe) · **Lighting** (Natural ·
Warm · Cool · Dramatic) · **Time** (Day · Night) · **Furnishing** (Keep · Staged ·
Empty) · **Border** (Keep original · AI suggested) · **Quality** (from the wallet's
`renderTiers`) · an optional note.

Above the button: "This uses **2 AI credits**. You have 12." Short → **Buy credits**
(→ C28). **Make the image** → `POST /api/projects/{id}/renders { comboId, …options }` → C24.

As built:
- **Choices.** Text pills with the website's labels; there are no pictures. The hint for
  the chosen value sits under each row. The rows run Quality (first, as the only choice
  that changes the price), Paint from, Time of day, Borders and trim, Light, Furniture,
  Look. Paint from (`sourceImage`: cleaned or original photo) shows only when the room has
  a cleaned photo. An outdoor room says Surroundings for Furniture and uses outdoor hints.
  The server's own rule decides which: anything not marked `INDOOR` is outdoors. The
  defaults are the website's: Premium, and the room as it is. Pills are radio buttons to a
  screen reader. Make another and Try again arrive with the earlier image's choices and
  note on the route, and a value it doesn't know falls back to the default.
- **Price.** Each quality's price comes from the wallet's `renderTiers` ("Premium · 1 AI
  credit"). Until the wallet answers there is no price and no live button ("Make my image",
  disabled). A wallet that won't load says so, offers nothing to press or buy, and is
  never read as 0. **Exception to the "always ₹" rule (01, rule 3):** the cost line is in
  credits only, as on the website, because the credits are already bought. The ₹ price
  shows as soon as money would be spent: short, "You need 1 more AI credit for this image,
  at ₹70" ("…at ₹70 each" for more than one) and **Buy 1 AI credit · ₹70** (→ C28 with `from=ai-image`). The wallet is
  read again when the customer comes back, so a balance from before a purchase is never
  offered. An account that can't hold credits is told so.
- **Make my image** spends the credits on the server in that one request, and the server
  has no idempotency key. So:
  - The request is never sent twice: a second tap does nothing, the choices lock, a line
    says "Asking for your image… It will only be made once", and back is held, with a
    toast saying why.
  - Offline, nothing is sent, and the screen says nothing was spent.
  - A reply is obeyed, and nothing was spent: 402 shows the server's sentence and reads
    the wallet again. That sentence stays until the balance goes up; its own re-read
    doesn't clear it. A 404 for the option or for the room says which. 429 shows the
    server's wait. A note that is too long goes under the note field.
  - Silence (no answer in 45 s, a timeout, a 5xx) is not a "no". The room's images are
    looked at again 0, 2 and 5 s later. An image asked for exactly so (same option, every
    choice, the note) that is new since the ask, or is still being made, is this one, and
    C24 opens on it. Otherwise: "We couldn't hear back… please wait before trying again,
    so it isn't made twice". The room's images are then re-read every 5 s for 3 minutes.
- **A second image.** While an image of this option is being made, or after an
  unanswered ask, **Make** first asks "Make a second image?", with what it costs again.
  An image of the room being made shows a banner with **See it**, and is handed to
  `RenderWatcher`, so its end reaches the banner, the shelf and the wallet even if it is
  never opened; the wallet is read again when one appears (it was paid for when asked). If
  the room's images can't be read, it says so with Retry.
- **Change option** goes back to C22 for this room — back to it when it is the screen
  underneath, so Back never lands on a second copy. The shade disclaimer is at the foot.

### C24 · AI image — working and result

**Route** `ai-image/[renderId].tsx` · **Phase** 5

**Working:** `WorkingState` while `QUEUED` / `RUNNING` (poll
`GET /api/projects/{id}/renders/{renderId}`). "Leave this running" — it appears in
Boards when ready.

**Result:** the image full bleed, pinch to zoom · **Save to phone** · **Send on
WhatsApp** · **Share…** · the AI disclaimer. `FAILED` → plain reason; credits are not
lost (say so only if the server confirms a refund).

As built:
- **Working.** QUEUED and RUNNING look the same. The customer sees the time taken, never a
  status. The words change after 90 s ("the AI is busy… still trying", the website's
  wording) and again after 9½ minutes, past the server's 8-minute budget ("will still
  finish, or fail and hand your credits back"). The clock starts at the ask when it was
  asked on this phone. Otherwise it starts at the server's `createdAt` (India time, no
  zone), clamped between first sight and 25 minutes before it, so a phone clock that is
  off can't restart the wait or make it look ancient.
- **Polling.** `RenderWatcher`, mounted once under the customer's screens, does it, not C24.
  It polls every 2 s for the first minute, then every 5 s, then every 15 s once it is very
  late, pausing in the background. Because of that, **Leave this running** (back to the
  tabs already open, on Boards → AI images) loses nothing. When the image ends, the
  watcher re-reads the wallet, the shelf, the room's images and its options, so C4, C25
  and Home catch up wherever the customer is. An image remembered as "being made" from an
  earlier visit is checked with the server before Working is shown.
- **Ready.** The picture is capped at half the screen, so Send and Save stay in reach. Tap
  it for full screen (pinch to zoom, close button). **Send the image** opens the share
  sheet with the file. There is one button because a file reaches WhatsApp no other way
  without native code, as on C16. **Save to phone** asks for permission to add to the
  photos only now; a refusal offers Settings. **Send it as a PDF with its shades** makes a
  one-page PDF with the AI disclaimer, and is refused rather than sent without its shades.
  Then **Make another of this room** (C23 with its option, choices and note, read from the
  image itself) and **All my AI images**. Its shades show large and
  copyable, then both disclaimers. The picture's address is signed for an hour: an expired
  one is fetched afresh once, and a picture that still won't load offers Retry. A picture
  that can't be fetched is said as such, never blamed on the phone. Ready is felt (haptic)
  and announced when the customer watched it finish.
- **Failed.** Shows the server's own sentence when it is fit to show (it says the credit is
  back). Otherwise "Your credits are back" only when the wallet shows a `RENDER_REFUNDED`
  row since the ask; the render itself has no refund field. **Try again** goes to C23 with
  the same choices and note, and says it uses credits again.
- **Gone.** An image no longer on the account (404 or 403, even mid-wait) says so plainly.
  An old link without its room finds it from the shelf.

---

## Boards, reviews, money

### C25 · Board detail

**Route** `board/[projectId].tsx` · **Phase** 4

The room photo, the date the board was taken, every option on it (`GET /api/projects/{id}/combos`)
with shade codes large, **Make an AI image** (→ C23), and **Review the job** (→ C26)
once the work is done.

As built: a finished room opens here (CR). Options are grouped by board, in the order they
were printed; each has **Make an AI image of this option** (→ C23 with `comboId`) and says
when one was made. **Send the board again** when the file is on this phone; **See the
room** (C11, view only); **Review the job** for a finished room (the app can't know when
the painting is done). A room closed without a board says so; an open one says it hasn't
taken a board yet. An option is numbered by its place on its printed page.
Phase 5: **See the AI image** on an option with a finished one (→ C24). When the room's
images can't be read, a banner says so with Retry, and an option the server marks as
rendered says "An AI image was asked for" rather than nothing.

### C26 · Review the job

**Route** `review/[projectId].tsx` · **Phase** 7 · **Web reference** `app/r/[token]/board-review-panel.tsx`

Stars (1–5), a few words, the name to show (prefilled with `suggestedName`). Shows the
shop's name. Already reviewed → shows it, editable while `canEdit`.

**API:** `GET /api/community/reviews/project/{projectId}` (the board code for this
room) → `GET/POST /api/community/reviews/board/{token}`.

**As built:** C26 finds the room's board code, then shows the same review screen as D1
(`BoardReviewScreen`). The form is checked the way the server checks it (1–5 stars; 10–1,000
characters and a 2–60 character name, each after the server's own trimming and space
folding), so nothing that would be refused is sent — each try counts against 10 an hour
per network. After a sending error with no answer, a 409 or a 5xx, the board is read
again: if the review is there (for a change, the one just sent), it's thanks, not an
error. Changing a published review warns that it comes off the page until it's read
again. A room with no board → the server's sentence; a room no longer on the account →
"This room isn't on your account any more."

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

As built: a balance that won't load is "didn't load" + Try again, never "0 rooms". A
self-serve account (no shop) always has **Buy rooms** (primary once it has none); a shop's
customer never does. The shop asked is named from C31's list, read when Ask is pressed —
the shop whose rooms these are (`retailerOrgId`), which is the one the server emails
(without one: "your shop"); asked once, it says so for the rest of the day. The rooms
figure shows only once both of its sources have answered. A linked profile has no Add a
shop code (as on Account). The price per credit shows the list price beside it while a
launch discount runs; credits lapsing within a month are coloured as a warning. A payment
still being confirmed shows a banner with **Check now** (D3).

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

As built: the website's counter (`credits-cart.tsx`) — two steppers, rooms and AI images,
and the basket packed the cheapest way the server sells it (`lib/cart-pack`, ported with
its tests: singles, the combo, the bundle and the offer a subtotal earns); the bill names
what took money off, and anything the packing adds is said. Everything goes through
`/api/billing/cart/order` (credits alone too — the same counter). **No discount-code
field**: the best offer a basket reaches applies itself, and a code can only name one it
already reaches. Opened with `?rooms=` / `?credits=`; Buy a room opens on one room. A
shop's customer sees AI images only — and nothing is offered until it is known whether the
account has a shop. A payment still being confirmed disables Pay.

After the audit: the bill names the packing as the website does ("Bundled as the room + AI
image", "2 × …"). The button's total is the phone's packing of a cart that may be a
moment old, so the order's own amount is checked against it: a different price opens
nothing and says the new total. An order the server refuses re-reads the counter. Back is
held while a payment is under way, so its result is always shown.

### C29 · Payment result

**Route** `payment-result.tsx` · **Phase** 4

| Outcome | Screen |
|---|---|
| Verified | "Paid. 2 rooms added." + new balance + **Start a room** |
| Cancelled | Back to the basket, nothing said beyond "Payment cancelled." |
| Browser closed with no answer | Not "cancelled" — it may have been paid: "The payment wasn't finished. If you did pay, it'll be added…" |
| Refused by our server for good | Its reason, the payment reference and **Get help**; the proof is dropped so Pay works again |
| Failed | Razorpay's reason in plain words + **Try again** |
| Paid but verify failed / no network | "We're checking your payment" — retry the verify; never say "failed" after a success |

As built: the screen reads the outcome kept for the order (`features/payments`); checking
tries again by itself (after 4, 10 and 30 s) and on **Check again**, shows the payment
reference, and never a Pay button. Cancelled is said on the basket (a toast); C29 shows it
only after a cold start. Try again reopens the same basket — the quantities asked for,
not what the packing added. A re-check keeps the checking screen (only its button is
busy). The server's 403 "Payment verification error." means Razorpay couldn't be asked,
so it stays "checking"; any other 4xx is a refusal for good. Paid gives a success haptic.
Bought from C23 (`from=ai-image`, carried through C28), paid leads **Back to your AI
image**, back to the C23 it came from with its choices kept (C22 after a cold start).

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

**As built:** location is asked for only on **Use my location** (a card that says why,
and that it's used for this search only); when it was allowed before, the search starts
by itself. The position is rounded to about 100 m before it leaves the phone. A recent
fix is used first, then a fresh one with a 15 s limit. Refused for good → **Open
settings**; location off or no fix → said, and **Use my location** tries again.

- **Painters:** "Under 1 km away" rather than a figure (the server already blurs a
  painter's spot); a line on jobs done and reviews, or "New on HueVistaa" when there are
  none. **Call** asks for the number once (each one counts against 20 a day), dials it,
  then shows it on its own line with **WhatsApp**; it is kept for the session and never
  asked for again. Refused → the server's sentence under the card. Offline → said at
  once; it never waits for the signal and dials by itself later.
- **Shops:** address, hours, **Directions** (Apple Maps on iOS, Google Maps elsewhere),
  and **Call** when the number can be dialled.
- Distance chips change the search; an empty list offers the next distance up. The 50
  nearest are shown, and the list says so. Searches share 60 an hour per account, so a
  refusal is shown in the server's words and never retried by itself; nothing reloads on
  focus or reconnect.
- The painter's P5 preview shows their own card as customers see it.

### C33 · Work as a painter

**Route** `become-painter.tsx` · **Phase** 6

Explains what a painter account does, and plainly: "This changes this account into a
painter's account for good. A painter account can't plan its own rooms." **Make this a
painter account** → `POST /api/painters/me` → reload profile → `/painter`.

Refused (rooms or a shop code on the account) → the backend's reason: "Sign up
separately to work as a painter."

**As built:** the change is confirmed first in a sheet that says it's for good. Refused →
the server's own sentence. No new token comes back (the role is read on every request),
so the profile is read again and the guards hand over to `/painter`. Pressing again after
a lost answer is safe: the server's call is idempotent.
