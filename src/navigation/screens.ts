/**
 * Every planned screen, in one place. Placeholders (<PlannedScreen id="C11" />) and the
 * development screen list (app/dev.tsx) read from here.
 *
 * When a screen is built: replace its placeholder with the real screen and set its
 * `status` to "built". The specs live in docs/ — see docs/08-roadmap.md for the order.
 *
 * `href` opens the screen; dynamic segments use "demo" so placeholders can be walked
 * without real data.
 */
export type ScreenArea = "auth" | "onboarding" | "customer" | "painter" | "account" | "links";

export interface ScreenInfo {
  title: string;
  area: ScreenArea;
  href: string;
  phase: number;
  /** The doc that specifies it, under docs/. */
  spec: string;
  /** One line: why it exists. */
  summary: string;
  /** Where it leads, for walking the placeholders. */
  next?: readonly string[];
  status: "planned" | "built";
}

const AUTH = "03-screens-auth.md";
const CUSTOMER = "04-screens-customer.md";
const PAINTER = "05-screens-painter.md";
const SHARED = "06-screens-shared.md";

export const screens = {
  // ── Signing in and the first run ──────────────────────────────────────────
  // Restore + role routing + "still connecting" are in place (app/index.tsx); the
  // remembered deep link (spec step 5) is not yet — so this stays "planned".
  A1: { title: "Splash and session restore", area: "auth", href: "/", phase: 1, spec: AUTH, status: "built",
    summary: "Open on the right screen without a flash of the wrong one." },
  A2: { title: "Welcome", area: "auth", href: "/welcome", phase: 1, spec: AUTH, status: "built",
    summary: "Say what HueVistaa does in one look, and get the person signed in.", next: ["A3", "A5"] },
  A3: { title: "Your mobile number", area: "auth", href: "/phone", phase: 1, spec: AUTH, status: "built",
    summary: "Ask for a mobile number and text a 6-digit code.", next: ["A4"] },
  A4: { title: "Enter the code", area: "auth", href: "/phone-code", phase: 1, spec: AUTH, status: "built",
    summary: "Six boxes, SMS autofill, resend on the server's countdown.", next: ["A10"] },
  A5: { title: "Sign in with email", area: "auth", href: "/email-sign-in", phase: 1, spec: AUTH, status: "built",
    summary: "Email and password, with the shop and admin second steps.", next: ["A6", "A7", "A8"] },
  A6: { title: "Create an account", area: "auth", href: "/register", phase: 1, spec: AUTH, status: "built",
    summary: "Name, email, password, optional mobile.", next: ["A10"] },
  A7: { title: "Forgot password", area: "auth", href: "/forgot-password", phase: 1, spec: AUTH, status: "built",
    summary: "A code by email or text, then a new password.", next: ["A5"] },
  A8: { title: "Check your email (shops)", area: "auth", href: "/email-code", phase: 1, spec: AUTH, status: "built",
    summary: "A shop on a new device confirms an emailed code.", next: ["S10"] },
  A9: { title: "Google sign-in", area: "auth", href: "/sign-in/callback", phase: 1, spec: AUTH, status: "built",
    summary: "Trade the code Google sign-in returns for a session." },
  A10: { title: "About you", area: "onboarding", href: "/about-you", phase: 1, spec: AUTH, status: "built",
    summary: "Ask a new account's name, and whether they paint their home or paint for a living.", next: ["A11"] },
  A11: { title: "Quick tour", area: "onboarding", href: "/tour", phase: 1, spec: AUTH, status: "built",
    summary: "Three cards: photograph, try shades, leave with one board.", next: ["C30", "C1"] },

  // ── Customer ──────────────────────────────────────────────────────────────
  C1: { title: "Home", area: "customer", href: "/home", phase: 2, spec: CUSTOMER, status: "built",
    summary: "What I hold, the one next step, my rooms, painters near me.", next: ["C6", "C27", "C32", "C20", "C24"] },
  C2: { title: "Studio — my rooms", area: "customer", href: "/studio", phase: 3, spec: CUSTOMER, status: "built",
    summary: "Every room with its status, and New room.", next: ["C6", "CR", "C17"] },
  C3: { title: "Catalogue", area: "customer", href: "/catalogue", phase: 2, spec: CUSTOMER, status: "built",
    summary: "Every shade this account may use, searchable and filterable.", next: ["C19", "C20"] },
  C4: { title: "Boards", area: "customer", href: "/boards", phase: 4, spec: CUSTOMER, status: "built",
    summary: "Finished colour boards and AI images.", next: ["C25", "C22", "C24"] },
  C5: { title: "Account", area: "customer", href: "/account", phase: 2, spec: CUSTOMER, status: "built",
    summary: "Balance, shop code, nearby, help, sign-in details, settings.",
    next: ["C27", "C30", "C31", "C32", "C33", "S1", "S2", "S3", "S4", "S5", "S6", "S8"] },
  C6: { title: "Add photo", area: "customer", href: "/room/new", phase: 3, spec: CUSTOMER, status: "built",
    summary: "Step 1: the camera first; the photo uploads while the room is named.", next: ["C7", "C20"] },
  C7: { title: "Name it", area: "customer", href: "/room/details", phase: 3, spec: CUSTOMER, status: "built",
    summary: "Name and what is being painted, while the upload finishes.", next: ["C8"] },
  CR: { title: "Open the right step", area: "customer", href: "/room/demo", phase: 3, spec: CUSTOMER, status: "built",
    summary: "Sends a room to the step its state calls for.", next: ["C8", "C9", "C10", "C11", "C25"] },
  C8: { title: "Tidy up", area: "customer", href: "/room/demo/tidy", phase: 3, spec: CUSTOMER, status: "built",
    summary: "Steps 2–3: clean-up choices, then an honest working state.", next: ["C9", "C10"] },
  C9: { title: "Walls found", area: "customer", href: "/room/demo/walls", phase: 3, spec: CUSTOMER, status: "built",
    summary: "The walls the AI found, named, with which ones to paint.", next: ["C11", "C10", "C18"] },
  C10: { title: "Adjust walls", area: "customer", href: "/room/demo/adjust", phase: 3, spec: CUSTOMER, status: "built",
    summary: "Step 4: brush, eraser and shape tools to fix a wall.", next: ["C11"] },
  C11: { title: "Paint", area: "customer", href: "/room/demo/paint", phase: 3, spec: CUSTOMER, status: "built",
    summary: "Step 5: the room full screen, real light, any shade on any wall.",
    next: ["C12", "C13", "C14", "C15", "C17"] },
  C12: { title: "Shade picker", area: "customer", href: "/shade-picker?projectId=demo&regionId=1", phase: 3,
    spec: CUSTOMER, status: "built", summary: "A half-height sheet of shades that paints the wall as you tap." },
  C13: { title: "Suggested palettes", area: "customer", href: "/room/demo/suggestions", phase: 3, spec: CUSTOMER,
    status: "built", summary: "Three named palettes for this room, free." },
  C14: { title: "Before and after", area: "customer", href: "/room/demo/compare", phase: 3, spec: CUSTOMER,
    status: "built", summary: "A draggable divider between the photo and the painted room." },
  C15: { title: "Colour board — choose and confirm", area: "customer", href: "/room/demo/board", phase: 4,
    spec: CUSTOMER, status: "built", summary: "The saved options, and a plain confirm before the room closes.",
    next: ["C16"] },
  C16: { title: "Board ready", area: "customer", href: "/room/demo/board-done", phase: 4, spec: CUSTOMER,
    status: "built", summary: "Send it on, save it, and what to do next.", next: ["C22", "C32", "C2", "C25"] },
  C17: { title: "Share this room", area: "customer", href: "/room/demo/share", phase: 4, spec: CUSTOMER,
    status: "built", summary: "A link anyone can open to see and repaint the room." },
  C18: { title: "The walls are wrong", area: "customer", href: "/room/demo/report", phase: 3, spec: CUSTOMER,
    status: "built", summary: "Report a bad AI run; the team redraws the walls." },
  C19: { title: "Shade detail", area: "customer", href: "/shade/asian-paints/HV0348", phase: 2, spec: CUSTOMER,
    status: "built", summary: "One shade, large, with a code to read out at the counter.", next: ["C6", "C32"] },
  C20: { title: "Ready-made rooms", area: "customer", href: "/library", phase: 2, spec: CUSTOMER,
    status: "built", summary: "Rooms the HueVistaa team published, free to paint.", next: ["C21"] },
  C21: { title: "Ready-made room", area: "customer", href: "/library/demo", phase: 2, spec: CUSTOMER,
    status: "built", summary: "Paint this room — walls already marked.", next: ["C11"] },
  C22: { title: "AI image — choose the room", area: "customer", href: "/ai-image/new", phase: 5, spec: CUSTOMER,
    status: "built", summary: "A room with a colour board, then one of its options.", next: ["C23"] },
  C23: { title: "AI image — options", area: "customer", href: "/ai-image/options?projectId=demo&comboId=demo",
    phase: 5, spec: CUSTOMER, status: "built", summary: "Quality and the cost first, then how it's photographed.",
    next: ["C24", "C28"] },
  C24: { title: "AI image — working and result", area: "customer", href: "/ai-image/demo?projectId=demo",
    phase: 5, spec: CUSTOMER, status: "built", summary: "An honest wait, then the image — send, save, PDF.",
    next: ["C23", "C4"] },
  C25: { title: "Board detail", area: "customer", href: "/board/demo", phase: 4, spec: CUSTOMER, status: "built",
    summary: "Every option on a room's board, codes large.", next: ["C23", "C26", "C11"] },
  C26: { title: "Review the job", area: "customer", href: "/review/demo", phase: 7, spec: CUSTOMER,
    status: "built", summary: "Stars and a few words about the job behind a board." },
  C27: { title: "Rooms and credits", area: "customer", href: "/balance", phase: 4, spec: CUSTOMER,
    status: "built", summary: "What I hold, and how to get more.", next: ["C28", "C30"] },
  C28: { title: "Checkout", area: "customer", href: "/checkout", phase: 4, spec: CUSTOMER, status: "built",
    summary: "A short basket in exact ₹, paid through Razorpay.", next: ["C29"] },
  C29: { title: "Payment result", area: "customer", href: "/payment-result", phase: 4, spec: CUSTOMER,
    status: "built", summary: "Paid, cancelled, failed — or still checking, never a false failure.", next: ["C6", "C27", "C28"] },
  C30: { title: "Add a shop code", area: "customer", href: "/add-shop-code", phase: 2, spec: CUSTOMER,
    status: "built", summary: "The 8-character code a shop gave at the counter." },
  C31: { title: "My products", area: "customer", href: "/my-products", phase: 2, spec: CUSTOMER,
    status: "built", summary: "What the shop unlocked for this account." },
  C32: { title: "Painters and shops near you", area: "customer", href: "/nearby", phase: 7, spec: CUSTOMER,
    status: "built", summary: "Listed painters and shops, nearest first, one tap to call." },
  C33: { title: "Work as a painter", area: "customer", href: "/become-painter", phase: 6, spec: CUSTOMER,
    status: "built", summary: "Turn this account into a painter's, saying plainly it is for good." },

  // ── Painter ───────────────────────────────────────────────────────────────
  P1: { title: "Home", area: "painter", href: "/painter", phase: 6, spec: PAINTER, status: "built",
    summary: "Points, expiring batches, Scan a board.", next: ["P3", "P2", "P4", "P5", "P12"] },
  P2: { title: "Points", area: "painter", href: "/painter/points", phase: 6, spec: PAINTER, status: "built",
    summary: "Balance, batches with expiry dates, the full ledger.", next: ["P10"] },
  P3: { title: "Scan", area: "painter", href: "/painter/scan", phase: 6, spec: PAINTER, status: "built",
    summary: "The camera on a board's QR.", next: ["P6", "P7", "P8"] },
  P4: { title: "Rewards", area: "painter", href: "/painter/rewards", phase: 6, spec: PAINTER, status: "built",
    summary: "What points buy, priced against the balance.", next: ["P9"] },
  P5: { title: "Nearby — be found", area: "painter", href: "/painter/nearby", phase: 6, spec: PAINTER,
    status: "built", summary: "Whether customers nearby can find you, and what they see." },
  P6: { title: "Claim a board", area: "painter", href: "/painter/claim/demo", phase: 6, spec: PAINTER,
    status: "built", summary: "What the board is worth, then claim." },
  P7: { title: "Board came as a PDF", area: "painter", href: "/painter/upload-board", phase: 6, spec: PAINTER,
    status: "built", summary: "Read the QR off a WhatsApp PDF, on the phone.", next: ["P6"] },
  P8: { title: "Type the code", area: "painter", href: "/painter/type-code", phase: 6, spec: PAINTER,
    status: "built", summary: "For a board too creased to scan.", next: ["P6"] },
  P9: { title: "Reward detail", area: "painter", href: "/painter/reward/demo", phase: 6, spec: PAINTER,
    status: "built", summary: "One reward, and redeem.", next: ["P11"] },
  P10: { title: "My vouchers", area: "painter", href: "/painter/vouchers", phase: 6, spec: PAINTER,
    status: "built", summary: "Redemptions and their delivery status.", next: ["P11"] },
  P11: { title: "Voucher", area: "painter", href: "/painter/voucher/demo", phase: 6, spec: PAINTER,
    status: "built", summary: "The voucher code, large enough to read at arm's length." },
  P12: { title: "Trade profile", area: "painter", href: "/painter/profile", phase: 6, spec: PAINTER,
    status: "built", summary: "Service areas, specialties, experience, day rate.", next: ["S1"] },

  // ── Account screens both roles use ────────────────────────────────────────
  S1: { title: "Settings", area: "account", href: "/settings", phase: 2, spec: SHARED, status: "built",
    summary: "Legal, version, show me around, sign out, delete account.", next: ["S9", "A11"] },
  S2: { title: "Your name", area: "account", href: "/edit-name", phase: 2, spec: SHARED, status: "built",
    summary: "Change the name the app greets you by." },
  S3: { title: "Email", area: "account", href: "/verify-email", phase: 2, spec: SHARED, status: "built",
    summary: "Add or confirm an email with a code." },
  S4: { title: "Mobile number", area: "account", href: "/mobile-number", phase: 2, spec: SHARED,
    status: "built", summary: "Add, confirm or change the number that signs you in." },
  S5: { title: "Password", area: "account", href: "/password", phase: 2, spec: SHARED, status: "built",
    summary: "Change it, or set a first one." },
  S6: { title: "Help and support", area: "account", href: "/help", phase: 7, spec: SHARED, status: "built",
    summary: "Past conversations and Ask for help.", next: ["S7"] },
  S7: { title: "Support conversation", area: "account", href: "/help/demo", phase: 7, spec: SHARED,
    status: "built", summary: "Chat with the assistant, or ask for a person." },
  S8: { title: "Questions and answers", area: "account", href: "/questions", phase: 7, spec: SHARED,
    status: "built", summary: "Community answers, and ask your own." },
  S9: { title: "Delete account", area: "account", href: "/delete-account", phase: 2, spec: SHARED,
    status: "built", summary: "Exactly what goes, then delete for good." },
  S10: { title: "Web-only accounts", area: "account", href: "/web-only", phase: 1, spec: SHARED,
    status: "built", summary: "Shops, distributors and admins work on the website." },

  // ── Links from outside the app ────────────────────────────────────────────
  D1: { title: "A board's QR", area: "links", href: "/r/demo", phase: 7, spec: SHARED, status: "built",
    summary: "Painter: claim points. Customer: review the job." },
  D2: { title: "A shared room", area: "links", href: "/share/demo", phase: 7, spec: SHARED, status: "built",
    summary: "View and repaint someone's shared room; save it as your own." },
  D3: { title: "Payment return", area: "links", href: "/pay/callback", phase: 4, spec: SHARED,
    status: "built", summary: "Finish a payment when Android restarted the app mid-checkout.", next: ["C29", "C28"] },
} as const satisfies Record<string, ScreenInfo>;

export type ScreenId = keyof typeof screens;

export function screenInfo(id: ScreenId): ScreenInfo {
  return screens[id];
}

export const areaOrder: readonly ScreenArea[] = ["auth", "onboarding", "customer", "painter", "account", "links"];
