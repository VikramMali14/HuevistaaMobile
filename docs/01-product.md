# 01 · Product

## What the app is

HueVistaa lets someone photograph a room, finds the walls automatically, and shows
real catalogue shades (Asian Paints first, then Berger and Nerolac) on their own
walls before they buy a single litre. The phone app carries the two people who use
HueVistaa on a phone: **the homeowner** and **the painter**.

Shops, distributors and the HueVistaa team keep using the website. Their work
happens at a counter or a desk, on a wide screen, in long sessions. That is not a
phone job.

## Who uses it

### 1. The homeowner (`CUSTOMER`)

Two kinds, and the app must serve both without forking into two designs:

| | Shop customer | Self-serve customer |
|---|---|---|
| How they arrive | Signs in, then adds the access code a paint shop handed them at the counter | Signs in and starts on their own |
| Rooms | Given by the shop. When they run out, they **ask the shop** — they are never sold one | Bought in the app (₹, Razorpay) |
| Catalogue | Narrowed to the companies the shop carries | Everything published |
| Shade codes | May be renumbered into the shop's own scheme, or hidden | Universal HV codes |
| "My products" | Yes — what the shop unlocked | No |

**Their situation:** a mid-range Android phone, patchy 4G, often standing in a shop
with a shopkeeper waiting, one hand holding a paint card. They want to see their own
wall in a colour, fast, and leave with something they can show at home.

### 2. The painter (`PAINTER`)

An independent tradesperson — **not a shop's employee**. A finished colour board
carries a QR code; scanning it pays the painter points, which buy kit from a
catalogue the HueVistaa team delivers. Painters can also choose to be found by
customers nearby.

**Their situation:** one hand free, a cracked screen, bright sunlight or a dim room,
and thirty seconds. Big targets, few words, and the scanner one tap away.

### 3. Everyone else (`RETAILER`, `DISTRIBUTOR`, `ADMIN`)

They can sign in, but the app shows one screen (**S10 · Web-only accounts**) that
sends them to the website. One exception: a shop with its **customer profile**
switched on gets a "Continue as customer" button, because a shop owner is often
painting their own home too.

## One app, routed by role

One account has exactly one role (`UserRole.java`). After sign-in the app reads the
profile and sends the person to the right half:

```
                       ┌──────────────┐
            app start  │  A1 Splash   │  restores the saved session
                       └──────┬───────┘
                              │
              signed in? ─────┴───── no ──► A2 Welcome ─► sign in (A3–A9)
                  │ yes                                        │
                  ▼                                            │
          first run? (namePending / welcomePending) ◄──────────┘
                  │ yes ─► A10 About you ─► (customer) A11 Tour
                  ▼ no
        ┌─────────┼──────────────┬──────────────────────┐
     CUSTOMER   PAINTER    RETAILER (customer      DISTRIBUTOR / ADMIN /
        │          │        profile on → switch)   RETAILER (profile off)
        ▼          ▼               │                    │
   Customer tabs  Painter tabs     └──► S10 Web-only ◄──┘
```

**Becoming a painter.** Every new account starts as a customer. On the first-run
screen (A10) the person picks "I'm painting my home" or "I paint for a living". The
second choice calls `POST /api/painters/me`, which turns the account into a painter
for good. An existing customer can do the same later from **C33**, unless they
already have rooms or a shop code — the backend refuses then, and the app shows its
reason (they need a separate account).

## Navigation map

### Customer — five tabs

| Tab | What it holds | Main screens |
|---|---|---|
| **Home** | What I hold, the one next step, rooms in progress, latest AI image, painters & shops near me, ready-made rooms | C1 |
| **Studio** | Every room, and "New room" | C2 → C6 … C18 |
| **Catalogue** | All shades, filters, shade detail, ready-made rooms | C3, C19–C21 |
| **Boards** | Finished colour boards and AI images | C4, C22–C26 |
| **Account** | Rooms & credits, shop code, my products, nearby, help, settings | C5, C27–C33, S1–S9 |

The tab bar **hides** inside the studio's canvas steps (C10, C11, C14), so the room
gets the whole screen. The system back gesture always goes one step back.

### Painter — five tabs, Scan in the middle

| Tab | Main screens |
|---|---|
| **Home** | P1 |
| **Points** | P2, P10, P11 |
| **Scan** (a brass capsule, centre) | P3 → P6, P7, P8 |
| **Rewards** | P4, P9 |
| **Nearby** | P5 |

The trade profile (P12) and settings (S1) open from the avatar in the header.

### Links from outside the app

| Link | Opens | Who |
|---|---|---|
| `https://huevistaa.com/r/{token}` (the board's QR) | D1 | Painter: claim points. Customer: review the job |
| `https://huevistaa.com/share/{token}` | D2 | Anyone — view and repaint a shared room |
| `huevista://sign-in/callback#code=…` | A9 | Google sign-in coming back |
| `huevista://pay/callback#status=…` | D3 | Razorpay coming back |

The `https://` links open the app only once the website serves the App Links file
(see the cross-repo list in [08-roadmap.md](08-roadmap.md)). Until then they open the
website, which still works.

## Rules every screen follows

These come from the product, not from taste. A screen that breaks one is not done.

1. **The only saturated colour on screen is the paint.** The UI is ink, paper and
   brass. See [02-design-system.md](02-design-system.md).
2. **Two disclaimers, word for word, with real space** — not fine print:
   - On anything showing shades:
     > Shade colours are taken from the paint companies' own shade cards and fan decks.
     > Screens, printing and lighting all shift colour, so what you see here can differ
     > from the paint on the wall. Always check the physical shade card at the counter
     > before you buy.
   - On anything AI-generated:
     > Previews are generated by AI. They are a guide to how a colour might look, not an
     > exact picture of the finished wall — edges, textures and lighting can come out
     > differently, and results are not guaranteed.
3. **Money is always ₹ and always exact.** Never "credits" without the rupee figure
   nearby. Prices come from the server (`/api/pricing`, order responses), never from
   the app.
4. **A swatch works in three shapes:** name + code, code only, or neither. A shop can
   hide names and renumber codes. Removing a line must not leave a hole.
5. **Shade codes are big, tabular, natural case, and long-press copyable.** Someone is
   reading them aloud across a counter.
6. **Every AI step has an honest working state** — what is happening in plain words,
   roughly how long, elapsed time, and a way out that does not lose the work. A bare
   spinner is never enough. These steps take 10–40 seconds (AI images longer).
7. **Every screen designs its empty, failed and offline states,** not just the happy
   path.
8. **Nothing irreversible without saying so first.** Taking a colour board closes the
   room; deleting a room or the account is permanent; becoming a painter is permanent.
   Each has a confirm step that says exactly what will happen.
9. **WhatsApp first.** Every share puts WhatsApp ahead of copy-link and the system
   share sheet.
10. **One-handed.** Primary actions sit in the bottom third. Targets are at least 48 dp.
11. **Plain English, Indian spelling** — colour, not color. Sentence case. No
    exclamation marks, no "SKU", no "asset". Every string lives in `src/i18n` so Hindi
    can follow.
12. **Ask for a permission only at the moment it is needed,** with a one-line reason
    first (camera when taking a photo, location when searching nearby).

## Thinking as the end user

What a homeowner in a shop needs, in order:

1. **Get in fast.** Mobile number + texted code is the default — no password to
   invent at a counter. Google and email are there for those who prefer them.
2. **See their own wall in a colour within about a minute.** Camera first; the photo
   uploads while they name the room; the AI steps say what they are doing.
3. **Try many colours without thinking about cost.** Painting the walls is free and
   instant; only the board and AI images cost anything, and the app says so before
   the press.
4. **Leave with one thing.** The colour board — a PDF they can WhatsApp home — with
   the shade codes large enough to read out at the counter.
5. **Find someone to paint it.** Painters and shops near them, one tap to call.

What a painter needs: open the app → Scan is right there → points land with a clear
"done" → see what the points buy. Nothing else in the way.

## Thinking as the business

- **Never strand a paying customer.** Payment results are verified with the server;
  a dropped connection after paying shows "checking your payment", never "failed".
- **Never spend the customer's money twice.** The colour board is built before it is
  charged; a refused charge stops the hand-over (see C15).
- **Keep the shop in the loop.** Shop customers ask their shop for more rooms; they are
  never sold around the shop.
- **Measure what matters** (once analytics is added, Phase 8): time from sign-in to
  first painted wall, studio drop-off per step, board taken per room, painter claims.
