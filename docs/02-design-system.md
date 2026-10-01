# 02 · Design system — ink, paper and brass

This is the website's system (`HueVistaFrontEnd/src/app/globals.css`), carried to the
phone. Match it; do not invent a second one. The code lives in `src/theme/`.

## The one rule

**The only saturated colour on any screen is the paint.** A shade in the catalogue, a
wall in the studio, a swatch in a row — those are the subject. Everything around them
is ink, paper and a low-chroma brass. A violet or cyan in the UI makes every swatch
beside it read wrong, which in a paint app is a correctness bug, not a style choice.

The page is **warm** (`#100e0c`, never a blue-black) for the same reason: a cold page
tints warm shades green.

The rule reaches the native chrome too: Android's system accent (`primaryColor` in
`app.json`) is brass, not Expo's default blue — otherwise native dialogs and text
handles would carry a blue into a paint app.

## Colour tokens

The app follows the phone's light/dark setting. **Design dark first** — it is the
default the brief asks for — then check light.

Every value below is copied from the website: `:root` in `globals.css` for dark,
`html[data-theme="light"]` for light. The website's name is in brackets where it
differs. `src/theme/colors.ts` holds them; `src/theme/__tests__/colors.test.ts`
fails if a change makes any text pairing unreadable.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#100e0c` | `#f6f3ec` | Page |
| `bgDeep` | `#0a0908` | `#ece8df` | Behind the page, scrims, the studio canvas |
| `surface` | `#191612` | `#ffffff` | Cards, sheets, **input boxes** |
| `surfaceSoft` | `#221e19` | `#f0ece2` | Raised, pressed, disabled buttons |
| `fg` | `#ece8e1` | `#191612` | Main text; a focused field's border |
| `fgSoft` | `#c4bdb2` | `#433e37` | Secondary text, field labels |
| `fgMute` | `#8e867a` | `#6d6659` | Captions, eyebrows, inactive tabs |
| `fgMuteDeep` (`--fg-mute-deep`) | `#8a8175` | `#6b6457` | Placeholders |
| `accent` | `#c08b4e` | `#c08b4e` | Brass as a **fill** — buttons, active states. **Never text on light** |
| `accentOn` | `#17130e` | `#17130e` | Text **on** a brass fill. Never white |
| `accentText` | `#d0a165` | `#8a5f28` | Brass **as text** (links, active tab) |
| `accentSoft` | `#d6a66e` | `#d6a66e` | The lifted cut of brass |
| `accentDeep` | `#9a6a33` | `#8a5f28` | The deep cut of brass. **Not** a pressed fill — ink on it fails (3.3–3.9:1) |
| `mark` (`--hv-mark`) | `#d6a66e` | `#8a5f28` | The brand mark |
| `warmText` (`--accent-warm`) | `#d9705a` | `#9c3f2c` | Warm secondary, as text |
| `warmFill` (`--accent-warm-fill`) | `#8a3a2e` | `#8a3a2e` | The destructive button (white text) |
| `danger` (`--terracotta`) | `#c2402a` | `#a83b22` | Errors as a fill, marks |
| `dangerText` (`--terracotta-text`) | `#d9705a` | `#a83b22` | Errors as text |
| `success` (`--sage`) | `#4e7a52` | `#3f6a45` | Success as a fill (ivory text) |
| `successText` (`--sage-text`) | `#6fae76` | `#3f6a45` | Success as text |
| `ivory` | `#f7f6f2` | `#f7f6f2` | Text on a danger or success fill |
| `rule` | `rgba(236,232,225,.08)` | `rgba(25,22,18,.16)` | Hairlines |
| `ruleStrong` | `rgba(236,232,225,.16)` | `rgba(25,22,18,.28)` | Field borders, outline buttons |
| `ruleBrass` | `rgba(192,139,78,.35)` | `rgba(192,139,78,.42)` | Brass hairline |

**Why two cuts of brass.** Brass is struck once for both themes; what changes is which
cut may carry words. On dark, `accentText` is lifted (8.2:1). On light, brass fails as
text (2.7:1), so `accentText` deepens to `#8a5f28` (5.1:1). Never put text — or a focus
ring — in `accent` on a light page.

**Measured contrast** (every pairing passes WCAG AA, 4.5:1 for text):

| | Dark | Light |
|---|---|---|
| `fg` on `bg` | 15.8 | 16.3 |
| `fgMute` on `surfaceSoft` (the weakest text pairing) | 4.6 | 4.8 |
| `accentText` on `surfaceSoft` | 7.1 | 4.8 |
| `accentOn` on `accent` (primary button) | 6.2 | 6.2 |
| white on `warmFill` (destructive button) | 7.7 | 7.7 |
| `ivory` on `success` | 4.6 | 5.8 |

## Type

Mapped from the website's tokens at phone width. The website renders **Inter
everywhere** (its `.hv-glasswork` block points the serif and mono tokens at Inter) in
four weights — 400, 500, 600, 700 — all loaded by the app.

| Role | Website token | Face | Size / line | Tracking |
|---|---|---|---|---|
| `display` | `--t-band`, `.display` | Inter **700** | 34 / 39 | −.026em |
| `title1` | `--t-section`, `.display` | Inter **700** | 28 / 33 | −.020em |
| `title2` | `--t-card` | Inter 600 | 23 / 28 | −.015em |
| `title3` | `--t-panel` | Inter 600 | 19 / 25 | −.008em |
| `lead` | `--t-lead` | Inter 400 | 17 / 26 | — |
| `body` | `--t-body` | Inter 400 | 16 / 24 | — |
| `bodyStrong` | | Inter 600 | 16 / 24 | — |
| `small` | `--t-sm` | Inter 400 | 14 / 20 | — |
| `caption` | `--t-xs` | Inter 400 | 12.5 / 17 | — |
| `label` | `.eyebrow` | Inter 600, **UPPERCASE** | 11.5 / 15 | +.14em |
| `fieldLabel` | `.field-label` | Inter 600, **UPPERCASE** | 12 / 16 | +.06em |
| `code` | `--code` | Inter 600, tabular figures | 20 / 26 (16–32) | +.02em, natural case |
| emphasis (`<Em>`) | `--display-serif` | Instrument Serif *italic* | 1.06 × the heading | normal |

- **Line heights are a little looser than the website's display leading** (.94–1.15).
  Android clips Inter's ascenders and descenders when the line height is close to the
  font size; a clipped heading is a broken screen.
- **Shade codes never take the label treatment** (uppercase + wide tracking). A code
  is read aloud at a counter; the digits must be unmistakable.
- Emphasis: *"Keep your **colours**."* — the one word in Instrument Serif italic at
  1.06× with normal tracking, in `fgSoft` (the website's `.display i`). Display headings
  only; never body text, never upright.
- Default colours follow the website: `lead` and `fieldLabel` in `fgSoft`, `label`
  (the eyebrow) in `fgMute`; everything else in `fg` unless a tone is given.
- Text scales with the phone's font-size setting. Dense roles (`label`, `caption`,
  `code`) cap scaling at 1.4–1.6× so rows do not break; scaling is never turned off.

## Space, shape, depth

- **Spacing scale (dp):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56. Screen side gutter
  **20**. Card padding **20**. Gap between cards **12**. Section gap **32**.
- **Radius by what the thing is** (`--r-*`): `xs` 6 (a tag, a code pill, a small
  swatch dot) · `sm` 10 (a thumbnail, **a catalogue swatch tile**) · `md` 16 (a card,
  a panel, **an input box** — the website's `.field` uses `--radius`) · `lg` 22 (a
  full-bleed surface, a sheet's top corners) · `pill` 999 (**every button**, chips,
  capsules).
- **Hairlines are 1 dp** (`--hairline: 1px`), never `StyleSheet.hairlineWidth` — that is
  a third of a pixel on most phones and much fainter than the website's line.
- **Hairlines, not shadows.** Surfaces separate by a `rule` line. The only shadow is
  under floating things (bottom sheet, toast, the Scan button), and it is soft.
- **Brass sparingly:** one primary button per screen; a lit hairline along the top of
  the active card; the active tab.

## Motion and touch

- Easing `cubic-bezier(.2,.7,.2,1)` (`--ease`) for state changes; `cubic-bezier(.16,1,.3,1)`
  (`--ease-out`) for things arriving. Durations from the website: **140 ms** a state
  change (a press, a colour swap), **240 ms** an element (a sheet, a chevron), **420 ms**
  an entrance. Sheets spring. Values in `motion` (`src/theme/index.ts`).
- Respect "Reduce motion": swap slides for fades, stop looping animations.
- Haptics (light) on: shutter, a swatch landing on a wall, points claimed, payment
  success, a destructive confirm. Nowhere else.
- Touch targets **≥ 48 dp**, even when the visible thing is smaller.
- Primary action in the bottom third. Long lists keep their main button pinned above
  the home indicator.

## Components

All in `src/components/ui/`. Build each once, with every state, before the screens
that need it. ✅ = included in the starting scaffold.

| Component | What it is | States to cover |
|---|---|---|
| `Screen` ✅ | Safe-area page with the warm background, optional scroll, keyboard avoidance | — |
| `Text` ✅ | Every text role above, theme-aware | — |
| `Button` ✅ | A capsule, mapped from the website: `primary` ← `.btn-brass` (brass, ink text) · `secondary` ← `.btn-ghost` (outline, `ruleStrong`) · `danger` ← `.btn-warm` (`warmFill`, white text) · `ghost` = a text link in `accentText`. Label Inter 600 16 | default · pressed (fills fade to .85, outlines raise to `surfaceSoft`) · **disabled (drained: `surfaceSoft`, `fgMute` text, `ruleStrong`, .55 — never a faded brass)** · loading |
| `IconButton` | Round, 48 dp target | default · pressed · disabled |
| `TextField` ✅ | ← `.field`: `fieldLabel` above in `fgSoft`; box `surface`, 1 dp `ruleStrong`, radius 16, padding 13/14, Inter 16; placeholder `fgMuteDeep`; error Inter 500 13 in `dangerText` | empty · focused (border `fg` — brass would be 2.7:1 on paper) · filled · error (border `dangerText`) · disabled |
| `PhoneField` | `+91` prefix, numeric pad, groups digits 5-5 | as TextField |
| `CodeInput` | 6 boxes for texted/emailed codes; paste and SMS autofill | as TextField |
| `ShopCodeInput` | Character boxes for a shop's access code | as TextField |
| `Card` ✅ | `surface`, radius 16, 1 dp `rule`, padding 20; `lit` = brass top edge | default · pressed (`surfaceSoft`, if tappable) |
| `ListRow` | Icon, title, subtitle, trailing value/chevron | default · pressed · destructive |
| `Chip` | Filter pill | off · on · disabled |
| `Segmented` | Two to three options (e.g. Colour boards / AI images) | — |
| `Swatch` | A small colour dot in a row: radius 6, 1 dp `ruleStrong` edge so pale shades still show | — |
| `SwatchTile` | ← `.hv-shade-card`: a square swatch, radius 10, 1 dp `rule` outline inside (so "Bone China" on cream is still a swatch); name Inter 500 15 on one line; code in `code` 15; in the three shapes (name+code, code, neither) | default · pressed · selected (two inset rings: 2 dp `fg`, then 2 dp `bg` — shows on white and black swatches alike) |
| `ShadeCode` | Large tabular code, long-press to copy (toast "Copied") | — |
| `BalanceChip` | "3 rooms left", "12 AI credits" | zero state (muted) |
| `TabBar` ✅ | `src/navigation/tab-bar.ts`, shared by both tab bars: **60 dp + the phone's bottom inset** (the navigator's 49 clips Inter labels), labels Inter 600 11/14, active in `accentText`, inactive `fgMute`. The painter's Scan is a custom brass button that reads the navigator's `aria-selected` | active · inactive |
| `StepDots` | The studio's five steps; only the active one labelled; spinner on a working step | — |
| `Sheet` | Bottom sheet with grabber; 50% / 85% / full | — |
| `ConfirmSheet` | Title, plain consequences list, confirm + cancel | default · destructive |
| `Toast` | Short message at the bottom | info · success · error |
| `Banner` | Inline message across a screen (offline, notice, warning) | info · warning · danger |
| `EmptyState` ✅ | Picture/illustration, one line, one action | — |
| `ErrorState` ✅ | Plain reason, Retry, "Get help" | — |
| `WorkingState` | The AI working pattern: stage name, plain sentence, elapsed time, rough estimate, "Leave this running" | — |
| `Skeleton` | Shimmer blocks shaped like the content | — |
| `Disclaimer` ✅ | The two fixed texts (`shades`, `ai`) | — |
| `BrandMark` ✅ | The two-chip H, in `mark` | — |
| `OfflineBanner` ✅ | X1 — the slim bar shown while offline. `Screen` renders it at the top of every page, **in the flow** (it pushes content down, never covers a back button); canvas screens can turn it off | online (hidden) · offline · unknown (hidden) |
| `Avatar` | Initials on brass-soft | — |
| `Stars` | Rating input and display | — |
| `Slider` | Radius for nearby search | — |
| `Switch` | On/off rows | — |
| `QrFrame` | Scanner viewfinder with corner marks and torch | — |

## Patterns

- **Disabled:** drained, never just faded — a faded brass button reads as a live action
  that does nothing (the website learned this the hard way).
- **Loading:** skeletons shaped like the content, never a full-screen spinner for a
  list. Keep what is already on screen while refreshing (pull-to-refresh).
- **Empty:** one sentence of what this place is for + the one action that fills it.
- **Error:** what went wrong in plain words, what to do, Retry. Never a raw server
  message or status code. Map known server codes to sentences (see
  `src/api/errors.ts`).
- **Offline:** a slim banner at the top ("You're offline. Showing what was saved.").
  Buttons that need the network stay visible but say why they are disabled.
- **AI working:** `WorkingState`. Name the stage ("Clearing the clutter", "Finding your
  walls"), give a plain sentence of what it does, an honest estimate ("about 20
  seconds"), elapsed time, and "Leave this running" — the job continues on the server.
- **Irreversible:** `ConfirmSheet` listing exactly what happens, with the destructive
  button in `danger` and the safe one as the default.
- **Money:** price in ₹ on the button itself ("Pay ₹99"), and what is being bought
  stated above it.
- **Forms:** one column, labels above, the keyboard type matching the field, "Next" on
  the keyboard moving down the form, errors under the field in `dangerText`.

## Accessibility checklist

- Every interactive element has an accessibility label and role.
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1 (the tokens above already pass).
- Font scaling on; test at 1.3× and the largest setting.
- Screen-reader order follows reading order; sheets trap focus.
- Do not rely on colour alone: selected swatches get a ring and a tick, errors get text.
- Swatches announce the shade name and code, or "unnamed shade" when hidden.

## Voice

Editorial, quiet, unhurried. Short declarative headlines, often with one italic word.
Plain English, Indian spelling. Vocabulary from the trade: *shade*, *shade card*,
*the counter*, *the shop*, *a room*. No exclamation marks, no "SKU", no "asset".

| Instead of | Write |
|---|---|
| "Oops! Something went wrong!" | "That didn't go through. Try again." |
| "Project" (to a customer) | "Room" |
| "Render" | "AI image" |
| "Segmentation" | "Finding your walls" |
| "Insufficient credits" | "You need 2 more AI credits for this." + the server's ₹ price beside the Buy button |
