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

## Colour tokens

The app follows the phone's light/dark setting. **Design dark first** — it is the
default the brief asks for — then check light.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#100e0c` | `#f6f3ec` | Page |
| `bgDeep` | `#0a0908` | `#ece8df` | Behind the page, scrims, the studio canvas |
| `surface` | `#191612` | `#ffffff` | Cards, sheets |
| `surfaceSoft` | `#221e19` | `#f0ece2` | Raised, pressed, inputs |
| `fg` | `#ece8e1` | `#191612` | Main text |
| `fgSoft` | `#c4bdb2` | `#433e37` | Secondary text |
| `fgMute` | `#8e867a` | `#6d6659` | Captions, placeholders |
| `accent` | `#c08b4e` | `#c08b4e` | Brass as a **fill** — buttons, active states |
| `accentOn` | `#17130e` | `#17130e` | Text **on** a brass fill. Never white |
| `accentText` | `#d0a165` | `#8a5f28` | Brass **as text** |
| `accentSoft` | `#d6a66e` | `#c08b4e` | The brand mark |
| `accentDeep` | `#9a6a33` | `#9a6a33` | Pressed brass |
| `warmText` | `#d9705a` | `#9c3f2c` | Warm secondary, as text |
| `warmFill` | `#8a3a2e` | `#8a3a2e` | Warm secondary, as a fill (ivory text) |
| `danger` | `#c2402a` | `#a83b22` | Errors, destructive — fill |
| `dangerText` | `#d9705a` | `#a83b22` | Errors, destructive — text |
| `success` | `#4e7a52` | `#3f6a45` | Success — fill |
| `successText` | `#6fae76` | `#3f6a45` | Success — text |
| `rule` | `rgba(236,232,225,.08)` | `rgba(25,22,18,.16)` | Hairlines |
| `ruleStrong` | `rgba(236,232,225,.16)` | `rgba(25,22,18,.28)` | Emphasised hairlines |
| `ruleBrass` | `rgba(192,139,78,.35)` | `rgba(192,139,78,.35)` | Brass hairline |

**Why two cuts of brass.** Brass is struck once for both themes; what changes is which
cut may carry words. On dark, `accentText` is lifted (8.3:1). On light, brass fails as
text (2.6:1), so `accentText` deepens to `#8a5f28` (5.1:1). Never put text in
`accent` on a light page.

## Type

| Role | Face | Size / line | Notes |
|---|---|---|---|
| `display` | Inter 600 | 34 / 38 | Screen heroes. Tight tracking (-0.02em) |
| `title1` | Inter 600 | 28 / 32 | Screen titles |
| `title2` | Inter 600 | 22 / 28 | Section titles, sheet titles |
| `title3` | Inter 600 | 18 / 24 | Card titles |
| `body` | Inter 400 | 16 / 24 | Running text. Never smaller for paragraphs |
| `bodyStrong` | Inter 600 | 16 / 24 | Emphasis in running text |
| `small` | Inter 400 | 14 / 20 | Secondary lines |
| `caption` | Inter 400 | 12 / 16 | Captions, timestamps |
| `label` | Inter 600 | 11 / 14 | **UPPERCASE, +0.08em tracking.** Eyebrows, counts, data labels |
| `code` | Inter 600, tabular figures | 16–32 | **Shade codes only.** Natural case, no wide tracking |
| `emphasis` | Instrument Serif *italic* | 1.06 × the heading | The one emphasised word in a display heading. Never body text, never upright |

Voice in a heading: *"Keep your **colours**."* — the bold word is set in Instrument
Serif italic at 1.06× with normal tracking and line-height 1.

Text must scale with the phone's font size setting. Cap scaling at 1.4× on dense
rows (swatch captions, tab labels) so layouts do not break; never disable it.

## Space, shape, depth

- **Spacing scale (dp):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56. Screen side gutter
  **20**. Gap between cards **12**. Section gap **32**.
- **Radius by what the thing is:** `xs` 6 (tag, code pill, swatch corner) · `sm` 10
  (input, small button, thumbnail) · `md` 16 (card, panel — the default) · `lg` 22
  (full-bleed surface, sheet top corners) · `pill` 999 (capsules).
- **Hairlines, not shadows.** Surfaces separate by a 1 px `rule`. The only shadow is
  under floating things (bottom sheet, toast, the Scan button), and it is soft.
- **Brass sparingly:** one primary button per screen; a lit hairline along the top of
  the active card; the active tab.

## Motion and touch

- Easing `cubic-bezier(.2,.7,.2,1)`, 160–240 ms. Sheets spring.
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
| `Button` ✅ | A capsule, like the website's `.btn`: `primary` (brass), `secondary` (outline), `ghost`, `danger` | default · pressed · disabled · loading |
| `IconButton` | Round, 48 dp target | default · pressed · disabled |
| `TextField` ✅ | Label above, hint/error below | empty · focused · filled · error · disabled |
| `PhoneField` | `+91` prefix, numeric pad, groups digits 5-5 | as TextField |
| `CodeInput` | 6 boxes for texted/emailed codes; paste and SMS autofill | as TextField |
| `ShopCodeInput` | Character boxes for a shop's access code | as TextField |
| `Card` ✅ | `surface`, 16 radius, hairline | default · pressed (if tappable) |
| `ListRow` | Icon, title, subtitle, trailing value/chevron | default · pressed · destructive |
| `Chip` | Filter pill | off · on · disabled |
| `Segmented` | Two to three options (e.g. Colour boards / AI images) | — |
| `Swatch` | A colour square | — |
| `SwatchTile` | Swatch + name + code, in the three shapes (name+code, code, neither) | default · selected · pressed |
| `ShadeCode` | Large tabular code, long-press to copy (toast "Copied") | — |
| `BalanceChip` | "3 rooms left", "12 AI credits" | zero state (muted) |
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
| `Avatar` | Initials on brass-soft | — |
| `Stars` | Rating input and display | — |
| `Slider` | Radius for nearby search | — |
| `Switch` | On/off rows | — |
| `QrFrame` | Scanner viewfinder with corner marks and torch | — |

## Patterns

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
