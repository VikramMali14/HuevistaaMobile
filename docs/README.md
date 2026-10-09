# HueVistaa Mobile — the plan

This folder is the full plan for the HueVistaa phone app. Read it in order the
first time. After that, use it page by page: every screen we build has a section
here that says what it is for, what is on it, what it calls, and how it behaves
when things go wrong.

| File | What it covers |
|---|---|
| [01-product.md](01-product.md) | Who uses the app, which roles it serves, the navigation map, and the rules every screen follows |
| [02-design-system.md](02-design-system.md) | Colours, type, spacing, components, patterns, accessibility, voice |
| [03-screens-auth.md](03-screens-auth.md) | Signing in and the first run — screens **A1–A11** |
| [04-screens-customer.md](04-screens-customer.md) | The homeowner's app — screens **C1–C33** |
| [05-screens-painter.md](05-screens-painter.md) | The painter's app — screens **P1–P12** |
| [06-screens-shared.md](06-screens-shared.md) | Account screens both roles use, deep links, and system states — **S1–S10, D1–D3, X1–X6** |
| [07-architecture.md](07-architecture.md) | How the code is organised: routing, API, sign-in, payments, the colour engine, security, performance, testing, builds |
| [08-roadmap.md](08-roadmap.md) | The order we build in, a checklist for every screen, and the changes the backend and website need |
| [09-release.md](09-release.md) | Releasing to Google Play and the App Store: the owner's decisions, the listing, data safety, content rating, review access, and the end-to-end tests |

## How a screen gets built

1. Open the screen's section (for example **C11 · Paint**).
2. The route file already exists as a placeholder — it names its screen ID.
3. Build it to the spec, including **every state** listed (loading, empty, error,
   offline, and the special cases).
4. Tick it off in [08-roadmap.md](08-roadmap.md) once it meets the
   "done" checklist there.

## Where the facts come from

This plan was written against the real code, not from memory:

- **Backend** — `VikramMali14/HueVista` (Spring Boot). Every endpoint named in a
  screen spec exists there today. Swagger at `/swagger-ui.html` is the source of
  truth for request and response shapes.
- **Website** — `VikramMali14/HueVistaFrontEnd`. Each screen names the web
  component that does the same job, so its rules and edge cases can be copied
  rather than rediscovered.
- **Painter website** — `VikramMali14/HueVistaaPainter`, the reference for every
  painter screen.
- **Design brief** — `HueVistaFrontEnd/docs/mobile-app-customer-design-brief.md`.
  Where this plan differs from the brief, this plan follows the current code (for
  example, a shop code is now added to an account that is already signed in; it no
  longer creates one).
